/**
 * EnrollIQ — fake bus for testing the tracker receiver (acts like the company's server)
 *
 *   node scripts/gps_simulator.js --url https://api.enrolliq.io/api/gps/push/ctpl --key YOUR_KEY --imei 861234567890123
 *
 * Options:  --lat 17.3850 --lng 78.4867   start point (default Hyderabad)
 *           --interval 5                   seconds between packets
 *           --count 0                      stop after N packets (0 = run until Ctrl+C)
 *           --speed 30                     km/h
 * Needs Node 18+.
 */
const a = Object.fromEntries(process.argv.slice(2).reduce((r, v, i, all) => (v.startsWith('--') ? [...r, [v.slice(2), all[i + 1]]] : r), []))
const url = a.url || 'http://localhost:5000/api/gps/push/ctpl'
const key = a.key || process.env.CTPL_PUSH_KEY
const imei = a.imei
if (!key || !imei) { console.log('Need --key and --imei'); process.exit(1) }
let lat = Number(a.lat || 17.385), lng = Number(a.lng || 78.4867)
const every = Number(a.interval || 5) * 1000, max = Number(a.count || 0), speed = Number(a.speed || 30)
const ist = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 19) + '+05:30'
let n = 0, ang = 0
const tick = async () => {
  ang += 0.15                                   // drive in a slow circle (~300 m radius)
  lat += Math.cos(ang) * 0.00012; lng += Math.sin(ang) * 0.00012
  const body = { imei: Number(imei), vehicle: 'SIM-BUS', time: ist(new Date()), latitude: +lat.toFixed(6), longitude: +lng.toFixed(6),
                 speed, ignition: 1, power: 'connected' }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: JSON.stringify(body) })
    console.log(`#${++n}`, r.status, await r.text(), `(${body.latitude}, ${body.longitude})`)
  } catch (e) { console.log('failed:', e.message) }
  if (max && n >= max) process.exit(0)
}
tick(); setInterval(tick, every)