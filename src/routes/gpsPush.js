/**
 * EnrollIQ — tracker push receiver (CTPL "Push API")
 * Save as:  backend/src/routes/gpsPush.js
 * Wire in server.js (after express.json, before the 404 handler):
 *     app.use('/api/gps', require('./routes/gpsPush'))
 *
 * The company POSTs to  /api/gps/push/ctpl  with header  x-api-key  and a JSON body:
 *   { imei, vehicle, time, latitude, longitude, speed, ignition, power }
 * Replies are always quick: {status:1,message} (accepted) or {status:0,message} (4XX, rejected).
 * They do NOT retry, so we answer first and write to the database afterwards.
 *
 * .env:  CTPL_PUSH_KEY=<long random secret>          (required)
 *        CTPL_PUSH_KEY_2=<next secret>               (optional — lets you rotate the key with no downtime)
 *        CTPL_ALLOWED_IPS=1.2.3.4,5.6.7.8            (optional — only accept pushes from these IPs)
 *        GPS_HISTORY_SECONDS=30                      (optional — min gap between saved trail points)
 */
const express = require('express')
const crypto  = require('crypto')
const { pool } = require('../db/pool')

const router = express.Router()
const HISTORY_GAP_MS = Number(process.env.GPS_HISTORY_SECONDS || 30) * 1000
const MAX_AGE_MS     = 15 * 60 * 1000          // ignore points older than this for the LIVE position
const MAX_FUTURE_MS  = 5 * 60 * 1000

const keys = () => [process.env.CTPL_PUSH_KEY, process.env.CTPL_PUSH_KEY_2].filter(Boolean)
const keyOk = (h) => {
  const a = Buffer.from(String(h || ''))
  return keys().some(k => { const b = Buffer.from(k); return a.length === b.length && crypto.timingSafeEqual(a, b) })
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '')

// Slow down anyone guessing keys: 20 bad attempts a minute per IP
const bad = new Map()
setInterval(() => bad.clear(), 60 * 1000).unref()

const reject = (res, code, message) => res.status(code).json({ status: 0, message })

const istString = (ms) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
const stripZeros = (s) => s.replace(/^0+/, '')

function parsePacket(b) {
  if (!b || typeof b !== 'object') return { error: 'Body must be JSON' }
  const imei = String(b.imei ?? '').trim()
  if (!/^\d{6,20}$/.test(imei)) return { error: 'imei must be 6-20 digits' }
  const lat = Number(b.latitude), lng = Number(b.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return { error: 'latitude / longitude invalid' }
  if (lat === 0 && lng === 0) return { error: 'no GPS fix (0,0)' }
  const now = Date.now()
  let t = b.time ? Date.parse(b.time) : NaN
  if (!Number.isFinite(t)) t = now
  if (t > now + MAX_FUTURE_MS) t = now
  const sp = Number(b.speed)
  const ign = b.ignition
  const ignition = (ign === 1 || ign === '1' || ign === true || /^(on|true)$/i.test(String(ign))) ? 1
                 : (ign === 0 || ign === '0' || ign === false || /^(off|false)$/i.test(String(ign))) ? 0 : null
  return { p: {
    imei, imeiKey: stripZeros(imei), vehicle: b.vehicle ? String(b.vehicle).slice(0, 80) : null,
    time: t, lat, lng, speed: Number.isFinite(sp) && sp >= 0 && sp < 400 ? sp : 0,
    ignition, power: b.power == null ? null : String(b.power).slice(0, 20),
  } }
}

const lastHistory = new Map()   // bus_id -> ms of last saved trail point

async function store(p) {
  const [buses] = await pool.query(
    `SELECT id FROM buses WHERE gps_device_id IS NOT NULL AND TRIM(LEADING '0' FROM TRIM(gps_device_id)) = ? LIMIT 2`, [p.imeiKey])

  if (!buses.length) {
    await pool.query(
      `INSERT INTO gps_unknown_devices (imei, last_vehicle, last_lat, last_lng) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE packets=packets+1, last_seen=NOW(), last_vehicle=VALUES(last_vehicle),
                               last_lat=VALUES(last_lat), last_lng=VALUES(last_lng)`,
      [p.imei, p.vehicle, p.lat, p.lng])
    return 'unknown'
  }
  if (buses.length > 1) { console.log(`⚠️  GPS: IMEI ${p.imei} is saved on more than one bus — packet ignored`); return 'duplicate' }

  const busId = buses[0].id
  if (Date.now() - p.time > MAX_AGE_MS) return 'old'      // buffered / replayed point: not a live position

  const dt = istString(p.time)
  const NEW = '(device_time IS NULL OR VALUES(device_time) >= device_time)'
  // device_time must stay the LAST assignment: MySQL applies them left to right.
  await pool.query(
    `INSERT INTO bus_locations (bus_id, latitude, longitude, speed, ignition, power, source, device_id, device_time)
     VALUES (?,?,?,?,?,?, 'device', ?, ?)
     ON DUPLICATE KEY UPDATE
       latitude   = IF(${NEW}, VALUES(latitude),  latitude),
       longitude  = IF(${NEW}, VALUES(longitude), longitude),
       speed      = IF(${NEW}, VALUES(speed),     speed),
       ignition   = IF(${NEW}, VALUES(ignition),  ignition),
       power      = IF(${NEW}, VALUES(power),     power),
       source     = IF(${NEW}, 'device',          source),
       device_id  = IF(${NEW}, VALUES(device_id), device_id),
       updated_at = IF(${NEW}, ?,                 updated_at),   -- a JS Date, so it is written/read in the same (India) time as the rest of the app
       device_time= IF(${NEW}, VALUES(device_time), device_time)`,
    [busId, p.lat, p.lng, p.speed, p.ignition, p.power, p.imei, dt, new Date()])

  const last = lastHistory.get(busId) || 0
  if (p.time - last >= HISTORY_GAP_MS) {
    lastHistory.set(busId, p.time)
    await pool.query(`INSERT INTO bus_location_history (bus_id, latitude, longitude, speed) VALUES (?,?,?,?)`,
      [busId, p.lat, p.lng, p.speed])
  }
  return 'ok'
}

router.post('/push/ctpl', (req, res) => {
  const ip = clientIp(req)
  if ((bad.get(ip) || 0) >= 20) return reject(res, 429, 'Too many failed attempts')
  const allow = (process.env.CTPL_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (allow.length && !allow.includes(ip)) { bad.set(ip, (bad.get(ip) || 0) + 1); return reject(res, 403, 'IP not allowed') }
  if (!keys().length || !keyOk(req.headers['x-api-key'])) { bad.set(ip, (bad.get(ip) || 0) + 1); return reject(res, 401, 'Invalid API key') }

  const { p, error } = parsePacket(req.body)
  if (error) return reject(res, 400, error)

  res.json({ status: 1, message: 'Received' })          // answer first — the company does not retry
  store(p).catch(e => console.log('⚠️  GPS store failed:', e.message))
})

// Bad JSON etc. on this router → 4XX in the company's format, never a 5XX
router.use((err, _req, res, _next) => reject(res, 400, 'Invalid JSON'))

module.exports = router
module.exports._test = { parsePacket }