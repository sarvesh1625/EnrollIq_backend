// backend/src/routes/driver.js
const router = require('express').Router()
const { pool }= require('../db/pool')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')

// ── Driver Auth Middleware ────────────────────────────────────────────────────
function driverAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.type !== 'driver') return res.status(403).json({ message: 'Driver access only' })
    req.driver = decoded
    next()
  } catch { res.status(401).json({ message: 'Session expired. Please login again.' }) }
}

// ── POST /api/driver/login ────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body
    if (!phone) return res.status(400).json({ message: 'Phone number is required' })

    const [drivers] = await pool.execute(
      `SELECT d.*, b.bus_number, b.plate_number, b.capacity, b.id AS bus_id,
              s.name AS school_name, s.id AS school_id
       FROM drivers d
       LEFT JOIN buses b ON b.id = d.bus_id
       JOIN schools s ON s.id = d.school_id
       WHERE d.phone = ? AND d.status = 'Active'`,
      [phone.replace(/\D/g,'').slice(-10)]
    )

    if (!drivers.length) return res.status(404).json({ message: 'No driver found with this phone number' })

    const driver = drivers[0]

    // If driver has a password set, verify it; otherwise allow phone-only login
    if (driver.password_hash && password) {
      const valid = await bcrypt.compare(password, driver.password_hash)
      if (!valid) return res.status(401).json({ message: 'Incorrect password' })
    }

    const token = jwt.sign(
      {
        id:          driver.id,
        name:        driver.name,
        phone:       driver.phone,
        school_id:   driver.school_id,
        school_name: driver.school_name,
        bus_id:      driver.bus_id,
        bus_number:  driver.bus_number,
        type:        'driver'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({ token, driver: { id: driver.id, name: driver.name, phone: driver.phone,
      school_name: driver.school_name, bus_number: driver.bus_number,
      plate_number: driver.plate_number, capacity: driver.capacity, bus_id: driver.bus_id } })
  } catch (err) { next(err) }
})

// ── GET /api/driver/me ────────────────────────────────────────────────────────
router.get('/me', driverAuth, async (req, res, next) => {
  try {
    const [drivers] = await pool.execute(
      `SELECT d.*, b.bus_number, b.plate_number, b.capacity,
              s.name AS school_name
       FROM drivers d
       LEFT JOIN buses b ON b.id = d.bus_id
       JOIN schools s ON s.id = d.school_id
       WHERE d.id = ?`,
      [req.driver.id]
    )
    if (!drivers.length) return res.status(404).json({ message: 'Driver not found' })
    res.json(drivers[0])
  } catch (err) { next(err) }
})

// ── GET /api/driver/route ─────────────────────────────────────────────────────
router.get('/route', driverAuth, async (req, res, next) => {
  try {
    const busId = req.driver.bus_id
    if (!busId) return res.json({ route: null, stops: [], students: [] })

    // Get route for this bus
    const [routes] = await pool.execute(
      `SELECT * FROM transport_routes WHERE bus_id = ? AND school_id = ? AND status = 'Active' LIMIT 1`,
      [busId, req.driver.school_id]
    )

    // Get enrolled students on this bus
    const [students] = await pool.execute(
      `SELECT st.*, s.name AS student_name, s.class, s.roll_number,
              s.parent_name, s.parent_phone
       FROM student_transport st
       JOIN students s ON s.id = st.student_id
       WHERE st.bus_id = ? AND st.status = 'Active'
       ORDER BY s.name`,
      [busId]
    )

    // Today's scans for this bus
    const today = new Date().toISOString().slice(0,10)
    const [todayScans] = await pool.execute(
      `SELECT ta.*, s.name AS student_name, s.class
       FROM transport_attendance ta
       JOIN students s ON s.id = ta.student_id
       WHERE ta.bus_id = ? AND DATE(ta.scanned_at) = ?
       ORDER BY ta.scanned_at DESC`,
      [busId, today]
    )

    res.json({
      route:       routes[0] || null,
      students,
      today_scans: todayScans,
    })
  } catch (err) { next(err) }
})

// ── POST /api/driver/scan ─────────────────────────────────────────────────────
router.post('/scan', driverAuth, async (req, res, next) => {
  try {
    const { qr_code, rfid_tag, trip_type, latitude, longitude } = req.body
    const busId    = req.driver.bus_id
    const schoolId = req.driver.school_id

    if (!qr_code && !rfid_tag) return res.status(400).json({ message: 'QR code or RFID tag required' })
    if (!trip_type) return res.status(400).json({ message: 'Trip type (Pickup/Drop) required' })
    if (!busId) return res.status(400).json({ message: 'No bus assigned to this driver' })

    const searchVal = qr_code || rfid_tag
    const searchCol = qr_code ? 'st.qr_code' : 'st.rfid_tag'

    const [found] = await pool.execute(
      `SELECT st.*, s.name, s.class, s.parent_name, s.parent_phone, s.school_id
       FROM student_transport st
       JOIN students s ON s.id = st.student_id
       WHERE ${searchCol} = ? AND st.status = 'Active'`,
      [searchVal]
    )

    if (!found.length) return res.status(404).json({ message: 'Student not found. Invalid QR/RFID.' })

    const student = found[0]

    // Check not already scanned today for same trip
    const today = new Date().toISOString().slice(0,10)
    const [alreadyScanned] = await pool.execute(
      `SELECT id FROM transport_attendance
       WHERE student_id = ? AND bus_id = ? AND trip_type = ? AND DATE(scanned_at) = ?`,
      [student.student_id, busId, trip_type, today]
    )

    if (alreadyScanned.length) {
      return res.status(409).json({
        message: `${student.name} already marked for ${trip_type} today`,
        already_scanned: true,
        student: { name: student.name, class: student.class }
      })
    }

    // Record attendance
    const [result] = await pool.execute(
      `INSERT INTO transport_attendance
        (school_id, student_id, bus_id, driver_id, scan_type, trip_type, status, latitude, longitude)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [schoolId, student.student_id, busId, req.driver.id,
       qr_code ? 'QR' : 'RFID', trip_type, 'Boarded',
       latitude || null, longitude || null]
    )

    // Send WhatsApp notification
    const time    = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
    const action  = trip_type === 'Pickup' ? 'boarded' : 'dropped off from'
    const message = `🚌 *Transport Update*\n\n*${student.name}* has ${action} *${req.driver.bus_number}* at *${time}*.\n\n${
      trip_type === 'Pickup'
        ? '📍 Your child is on the way to school.'
        : '🏠 Your child has been dropped off safely.'
    }\n\n— ${req.driver.school_name} Transport`

    let notified = false
    if (student.parent_phone) {
      try {
        const whatsapp = require('../services/whatsapp')
        const waResult = await whatsapp.sendText(student.parent_phone, message)
        notified = waResult.success
        await pool.execute(
          `INSERT INTO transport_notifications (school_id, student_id, attendance_id, parent_phone, message, channel, status)
           VALUES (?,?,?,?,?,'WhatsApp',?)`,
          [schoolId, student.student_id, result.insertId, student.parent_phone, message, notified?'Sent':'Failed']
        )
        if (notified) await pool.execute('UPDATE transport_attendance SET notified=1 WHERE id=?', [result.insertId])
      } catch {}
    }

    res.status(201).json({
      success: true,
      student: { name: student.name, class: student.class, parent_name: student.parent_name },
      bus_number: req.driver.bus_number,
      trip_type, time, notified,
    })
  } catch (err) { next(err) }
})

// ── POST /api/driver/start-route ──────────────────────────────────────────────
router.post('/start-route', driverAuth, async (req, res, next) => {
  try {
    const { route_id, trip_type } = req.body

    // End any existing active session
    await pool.execute(
      `UPDATE driver_sessions SET status='Ended', logout_time=NOW() WHERE driver_id=? AND status='Active'`,
      [req.driver.id]
    )

    const [result] = await pool.execute(
      `INSERT INTO driver_sessions (driver_id, bus_id, route_id, login_method, status) VALUES (?,?,?,'App','Active')`,
      [req.driver.id, req.driver.bus_id, route_id || null]
    )

    res.json({ message: 'Route started!', session_id: result.insertId })
  } catch (err) { next(err) }
})

// ── POST /api/driver/end-route ────────────────────────────────────────────────
router.post('/end-route', driverAuth, async (req, res, next) => {
  try {
    await pool.execute(
      `UPDATE driver_sessions SET status='Ended', logout_time=NOW() WHERE driver_id=? AND status='Active'`,
      [req.driver.id]
    )
    res.json({ message: 'Route ended.' })
  } catch (err) { next(err) }
})

// ── GET /api/driver/attendance-history ───────────────────────────────────────
router.get('/attendance-history', driverAuth, async (req, res, next) => {
  try {
    const { date } = req.query
    const targetDate = date || new Date().toISOString().slice(0,10)

    const [records] = await pool.execute(
      `SELECT ta.*, s.name AS student_name, s.class, s.parent_phone
       FROM transport_attendance ta
       JOIN students s ON s.id = ta.student_id
       WHERE ta.driver_id = ? AND DATE(ta.scanned_at) = ?
       ORDER BY ta.scanned_at DESC`,
      [req.driver.id, targetDate]
    )

    res.json({ records, date: targetDate, total: records.length })
  } catch (err) { next(err) }
})

module.exports = { router, driverAuth }