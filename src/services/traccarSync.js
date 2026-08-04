/**
 * EnrollIQ — Traccar → EnrollIQ sync service
 * ------------------------------------------
 * Save as:  src/services/traccarSync.js
 *
 * WHAT THIS IS
 * When you fit real GPS trackers to buses, they report to a Traccar server
 * (free, open-source, understands GT06/TK103/Concox and 200+ protocols).
 * This service polls Traccar every few seconds and copies each device's
 * position + status into your bus_locations table — so the EnrollIQ map
 * shows real buses with no change to the frontend.
 *
 * SETUP (later, when you have hardware)
 *  1. Run a Traccar server (traccar.org — free). Point your trackers at it.
 *  2. In Traccar, add each device and note its `uniqueId` (usually the IMEI).
 *  3. On each bus record, set gps_device_id = that uniqueId.
 *  4. Put these in your backend .env:
 *       TRACCAR_URL=http://your-traccar-host:8082
 *       TRACCAR_USER=you@example.com
 *       TRACCAR_PASS=yourpassword
 *       TRACCAR_SYNC=on
 *  5. In server.js:  require('./services/traccarSync').start()
 *
 * Until TRACCAR_SYNC=on, this does nothing — safe to wire up now.
 */
const { pool } = require('../db/pool')

const URL  = process.env.TRACCAR_URL
const USER = process.env.TRACCAR_USER
const PASS = process.env.TRACCAR_PASS
const POLL_MS = Number(process.env.TRACCAR_POLL_MS || 8000)

function auth() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
}

async function traccarGet(path) {
  const res = await fetch(`${URL}${path}`, { headers: { Authorization: auth() } })
  if (!res.ok) throw new Error(`Traccar ${path} → ${res.status}`)
  return res.json()
}

async function syncOnce() {
  // devices give us online/offline + uniqueId; positions give lat/long/etc.
  const [devices, positions] = await Promise.all([
    traccarGet('/api/devices'),
    traccarGet('/api/positions'),
  ])

  // map buses by their configured device id
  const [buses] = await pool.query(
    `SELECT id, gps_device_id FROM buses WHERE gps_device_id IS NOT NULL AND gps_device_id <> ''`)
  const busByDevice = {}
  buses.forEach(b => { busByDevice[String(b.gps_device_id)] = b.id })

  const devById = {}
  devices.forEach(d => { devById[d.id] = d })

  let updated = 0
  for (const p of positions) {
    const dev = devById[p.deviceId]
    if (!dev) continue
    const busId = busByDevice[String(dev.uniqueId)]
    if (!busId) continue

    const attrs = p.attributes || {}
    const online = dev.status === 'online'
    await pool.execute(
      `INSERT INTO bus_locations
         (bus_id, latitude, longitude, speed, heading, ignition, satellites, battery,
          source, device_id, address, trip_active)
       VALUES (?,?,?,?,?,?,?,?, 'device', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         latitude=VALUES(latitude), longitude=VALUES(longitude), speed=VALUES(speed),
         heading=VALUES(heading), ignition=VALUES(ignition), satellites=VALUES(satellites),
         battery=VALUES(battery), source='device', device_id=VALUES(device_id),
         address=VALUES(address), trip_active=VALUES(trip_active)`,
      [busId,
       p.latitude, p.longitude,
       p.speed != null ? Math.round(p.speed * 1.852) : null,  // knots → km/h
       p.course ?? null,
       attrs.ignition != null ? (attrs.ignition ? 1 : 0) : null,
       attrs.sat ?? null,
       attrs.batteryLevel ?? attrs.battery ?? null,
       String(dev.uniqueId),
       p.address || null,
       online ? 1 : 0])
    updated++
  }
  return updated
}

let timer = null
function start() {
  if ((process.env.TRACCAR_SYNC || '').toLowerCase() !== 'on') {
    console.log('ℹ️  Traccar sync is OFF (set TRACCAR_SYNC=on in .env to enable)')
    return
  }
  if (!URL || !USER || !PASS) {
    console.log('⚠️  Traccar sync enabled but TRACCAR_URL/USER/PASS missing — not starting')
    return
  }
  console.log(`📡  Traccar sync started → ${URL} (every ${POLL_MS}ms)`)
  const tick = async () => {
    try { const n = await syncOnce(); if (n) console.log(`   ↳ synced ${n} bus position(s)`) }
    catch (e) { console.log('   ⚠️  Traccar sync error:', e.message) }
  }
  tick()
  timer = setInterval(tick, POLL_MS)
}
function stop() { if (timer) clearInterval(timer) }

module.exports = { start, stop, syncOnce }