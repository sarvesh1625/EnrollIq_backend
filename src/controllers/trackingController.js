/**
 * EnrollIQ — Live Tracking + Cameras controller
 * Save as: src/controllers/trackingController.js
 *
 * Bus tracking:
 *   POST /api/tracking/buses/:busId/location   (driver sends GPS)  — public-ish, token optional
 *   POST /api/tracking/buses/:busId/trip       (start/stop trip)
 *   GET  /api/tracking/buses                    (admin: all live buses)
 *   GET  /api/tracking/buses/:busId             (single bus + recent trail)
 *
 * Cameras:
 *   GET    /api/tracking/cameras                (list)
 *   POST   /api/tracking/cameras                (add)
 *   PUT    /api/tracking/cameras/:id            (edit)
 *   DELETE /api/tracking/cameras/:id            (remove)
 */
const { pool } = require('../db/pool')

/* ─── BUS TRACKING ─────────────────────────────────────────── */

// Driver's device posts its location (called every few seconds while on trip)
exports.updateLocation = async (req, res, next) => {
  try {
    const busId = req.params.busId
    const { latitude, longitude, speed = null, heading = null } = req.body
    if (latitude == null || longitude == null)
      return res.status(400).json({ message: 'latitude and longitude required' })

    // ensure the bus exists (its school_id ties the position to a tenant)
    const [[bus]] = await pool.execute('SELECT school_id FROM buses WHERE id = ?', [busId])
    if (!bus) return res.status(404).json({ message: 'Bus not found' })

    await pool.execute(
      `INSERT INTO bus_locations (bus_id, latitude, longitude, speed, heading, trip_active)
       VALUES (?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE latitude=VALUES(latitude), longitude=VALUES(longitude),
         speed=VALUES(speed), heading=VALUES(heading), trip_active=1`,
      [busId, latitude, longitude, speed, heading])

    // breadcrumb (best-effort)
    pool.execute(
      `INSERT INTO bus_location_history (bus_id, latitude, longitude, speed) VALUES (?,?,?,?)`,
      [busId, latitude, longitude, speed]).catch(() => {})

    res.json({ message: 'ok' })
  } catch (e) { next(e) }
}

// Start / stop a trip
exports.setTrip = async (req, res, next) => {
  try {
    const busId = req.params.busId
    const { active, trip_type = null, driver_name = null } = req.body
    await pool.execute(
      `INSERT INTO bus_locations (bus_id, trip_active, trip_type, driver_name)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE trip_active=VALUES(trip_active),
         trip_type=VALUES(trip_type), driver_name=VALUES(driver_name)`,
      [busId, active ? 1 : 0, trip_type, driver_name])
    res.json({ message: active ? 'Trip started' : 'Trip ended' })
  } catch (e) { next(e) }
}

// Admin: all buses with their live location (active first)
exports.listLiveBuses = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.id AS bus_id, b.bus_number, b.plate_number, b.gps_device_id,
             l.latitude, l.longitude, l.speed, l.heading,
             l.trip_active, l.trip_type, l.driver_name, l.updated_at,
             l.ignition, l.satellites, l.battery, l.source, l.address,
             r.route_name
      FROM buses b
      LEFT JOIN bus_locations l ON l.bus_id = b.id
      LEFT JOIN transport_routes r ON r.bus_id = b.id
      WHERE b.school_id = ?
      GROUP BY b.id
      ORDER BY l.trip_active DESC, b.bus_number`, [req.user.school_id])
    // A bus is "live" if it reported a location in the last 30s.
    // For a GPS device this means the device is powered + has signal;
    // for a phone it means the driver has a trip running.
    const now = Date.now()
    rows.forEach(r => {
      const fresh = r.updated_at && (now - new Date(r.updated_at).getTime() < 30000)
      r.is_live   = !!fresh
      r.is_online = !!fresh                                   // device reachable
      // signal quality bucket from satellite count (device only)
      r.signal = r.satellites == null ? null
               : r.satellites >= 8 ? 'strong'
               : r.satellites >= 4 ? 'ok' : 'weak'
    })
    res.json(rows)
  } catch (e) { next(e) }
}

// Single bus + recent trail
exports.getBus = async (req, res, next) => {
  try {
    const busId = req.params.busId
    const [[bus]] = await pool.execute(`
      SELECT b.id AS bus_id, b.bus_number, b.plate_number,
             l.latitude, l.longitude, l.speed, l.heading,
             l.trip_active, l.trip_type, l.driver_name, l.updated_at
      FROM buses b LEFT JOIN bus_locations l ON l.bus_id = b.id
      WHERE b.id = ? AND b.school_id = ?`, [busId, req.user.school_id])
    if (!bus) return res.status(404).json({ message: 'Bus not found' })
    const [trail] = await pool.execute(
      `SELECT latitude, longitude, recorded_at FROM bus_location_history
       WHERE bus_id = ? ORDER BY recorded_at DESC LIMIT 30`, [busId])
    res.json({ ...bus, trail: trail.reverse() })
  } catch (e) { next(e) }
}

/* ─── CAMERAS ──────────────────────────────────────────────── */
exports.listCameras = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM cameras WHERE is_active = 1 AND school_id = ? ORDER BY location, name`,
      [req.user.school_id])
    res.json(rows)
  } catch (e) { next(e) }
}

exports.createCamera = async (req, res, next) => {
  try {
    const { name, location = null, stream_url, stream_type = 'hls' } = req.body
    if (!name?.trim() || !stream_url?.trim())
      return res.status(400).json({ message: 'name and stream_url are required' })
    const [r] = await pool.execute(
      `INSERT INTO cameras (name, location, stream_url, stream_type, school_id) VALUES (?,?,?,?,?)`,
      [name.trim(), location, stream_url.trim(), stream_type, req.user.school_id])
    res.status(201).json({ id: r.insertId, message: 'Camera added' })
  } catch (e) { next(e) }
}

exports.updateCamera = async (req, res, next) => {
  try {
    const { name, location, stream_url, stream_type } = req.body
    await pool.execute(
      `UPDATE cameras SET name=?, location=?, stream_url=?, stream_type=? WHERE id=? AND school_id=?`,
      [name, location, stream_url, stream_type, req.params.id, req.user.school_id])
    res.json({ message: 'Camera updated' })
  } catch (e) { next(e) }
}

exports.deleteCamera = async (req, res, next) => {
  try {
    await pool.execute(`UPDATE cameras SET is_active = 0 WHERE id = ? AND school_id = ?`,
      [req.params.id, req.user.school_id])
    res.json({ message: 'Camera removed' })
  } catch (e) { next(e) }
}