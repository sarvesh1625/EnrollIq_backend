// transportController.js
// Path fix: using ../db/pool (relative to controllers folder)
const { pool }   = require('../db/pool')
const whatsapp   = require('../services/whatsapp')

async function getDashboard(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const today    = new Date().toISOString().slice(0, 10)

    const [[buses]]       = await pool.execute(`SELECT COUNT(*) AS c FROM buses WHERE school_id=? AND status='Active'`, [schoolId])
    const [[drivers]]     = await pool.execute(`SELECT COUNT(*) AS c FROM drivers WHERE school_id=? AND status='Active'`, [schoolId])
    const [[students]]    = await pool.execute(`SELECT COUNT(*) AS c FROM student_transport WHERE school_id=? AND status='Active'`, [schoolId])
    const [[todayScans]]  = await pool.execute(`SELECT COUNT(*) AS c FROM transport_attendance WHERE school_id=? AND DATE(scanned_at)=?`, [schoolId, today])
    const [[pickupDone]]  = await pool.execute(`SELECT COUNT(*) AS c FROM transport_attendance WHERE school_id=? AND DATE(scanned_at)=? AND trip_type='Pickup'`, [schoolId, today])
    const [[dropDone]]    = await pool.execute(`SELECT COUNT(*) AS c FROM transport_attendance WHERE school_id=? AND DATE(scanned_at)=? AND trip_type='Drop'`, [schoolId, today])

    const [recentScans] = await pool.execute(`
      SELECT ta.*, s.name AS student_name, s.class, s.parent_phone,
             b.bus_number, d.name AS driver_name
      FROM   transport_attendance ta
      JOIN   students  s ON s.id = ta.student_id
      JOIN   buses     b ON b.id = ta.bus_id
      LEFT JOIN drivers d ON d.id = ta.driver_id
      WHERE  ta.school_id=? AND DATE(ta.scanned_at)=?
      ORDER  BY ta.scanned_at DESC LIMIT 20
    `, [schoolId, today])

    const [activeSessions] = await pool.execute(`
      SELECT ds.*, d.name AS driver_name, b.bus_number, r.route_name
      FROM   driver_sessions ds
      JOIN   drivers d ON d.id = ds.driver_id
      JOIN   buses   b ON b.id = ds.bus_id
      LEFT JOIN transport_routes r ON r.id = ds.route_id
      WHERE  ds.status='Active'
    `, [])

    res.json({
      stats: {
        active_buses:       buses.c,
        active_drivers:     drivers.c,
        enrolled_students:  students.c,
        today_scans:        todayScans.c,
        pickup_done:        pickupDone.c,
        drop_done:          dropDone.c,
      },
      recent_scans:    recentScans,
      active_sessions: activeSessions,
    })
  } catch (err) { next(err) }
}

async function getBuses(req, res, next) {
  try {
    const [buses] = await pool.execute(`
      SELECT b.*, d.name AS driver_name, r.route_name
      FROM   buses b
      LEFT JOIN drivers d ON d.bus_id = b.id AND d.status='Active'
      LEFT JOIN transport_routes r ON r.bus_id = b.id AND r.status='Active'
      WHERE  b.school_id=?
      ORDER  BY b.bus_number
    `, [req.user.school_id])
    res.json(buses)
  } catch (err) { next(err) }
}

async function createBus(req, res, next) {
  try {
    const { bus_number, plate_number, capacity, gps_device_id } = req.body
    if (!bus_number) return res.status(400).json({ message: 'bus_number is required' })
    const [result] = await pool.execute(
      `INSERT INTO buses (school_id, bus_number, plate_number, capacity, gps_device_id) VALUES (?,?,?,?,?)`,
      [req.user.school_id, bus_number, plate_number||null, capacity||40, gps_device_id||null]
    )
    const [rows] = await pool.execute('SELECT * FROM buses WHERE id=?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function updateBus(req, res, next) {
  try {
    const { bus_number, plate_number, capacity, gps_device_id } = req.body
    if (!bus_number) return res.status(400).json({ message: 'bus_number is required' })
    const [own] = await pool.execute('SELECT id FROM buses WHERE id=? AND school_id=?', [req.params.id, req.user.school_id])
    if (!own.length) return res.status(404).json({ message: 'Bus not found' })
    await pool.execute(
      `UPDATE buses SET bus_number=?, plate_number=?, capacity=?, gps_device_id=? WHERE id=? AND school_id=?`,
      [bus_number, plate_number||null, capacity||40, gps_device_id||null, req.params.id, req.user.school_id]
    )
    const [rows] = await pool.execute('SELECT * FROM buses WHERE id=?', [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function getRoutes(req, res, next) {
  try {
    const [routes] = await pool.execute(`
      SELECT r.*, b.bus_number, d.name AS driver_name,
             COUNT(DISTINCT rs.id) AS stop_count,
             COUNT(DISTINCT st.id) AS student_count
      FROM   transport_routes r
      LEFT JOIN buses    b  ON b.id  = r.bus_id
      LEFT JOIN drivers  d  ON d.id  = r.driver_id
      LEFT JOIN route_stops rs ON rs.route_id = r.id
      LEFT JOIN student_transport st ON st.route_id = r.id AND st.status='Active'
      WHERE  r.school_id=?
      GROUP  BY r.id
      ORDER  BY r.route_name
    `, [req.user.school_id])
    res.json(routes)
  } catch (err) { next(err) }
}

async function createRoute(req, res, next) {
  try {
    const { route_name, bus_id, driver_id, start_time, end_time, route_type } = req.body
    if (!route_name) return res.status(400).json({ message: 'route_name is required' })
    const [result] = await pool.execute(
      `INSERT INTO transport_routes (school_id, route_name, bus_id, driver_id, start_time, end_time, route_type)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.school_id, route_name, bus_id||null, driver_id||null, start_time||null, end_time||null, route_type||'Both']
    )
    const [rows] = await pool.execute('SELECT * FROM transport_routes WHERE id=?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function updateRoute(req, res, next) {
  try {
    const { route_name, bus_id, driver_id, start_time, end_time, route_type } = req.body
    if (!route_name) return res.status(400).json({ message: 'route_name is required' })
    const [own] = await pool.execute('SELECT id FROM transport_routes WHERE id=? AND school_id=?', [req.params.id, req.user.school_id])
    if (!own.length) return res.status(404).json({ message: 'Route not found' })
    await pool.execute(
      `UPDATE transport_routes SET route_name=?, bus_id=?, driver_id=?, start_time=?, end_time=?, route_type=? WHERE id=? AND school_id=?`,
      [route_name, bus_id||null, driver_id||null, start_time||null, end_time||null, route_type||'Both', req.params.id, req.user.school_id]
    )
    const [rows] = await pool.execute('SELECT * FROM transport_routes WHERE id=?', [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function getDrivers(req, res, next) {
  try {
    const [drivers] = await pool.execute(`
      SELECT d.*, b.bus_number,
             CASE WHEN ds.id IS NOT NULL THEN 'On Duty' ELSE 'Off Duty' END AS duty_status
      FROM   drivers d
      LEFT JOIN buses b ON b.id = d.bus_id
      LEFT JOIN driver_sessions ds ON ds.driver_id = d.id AND ds.status='Active'
      WHERE  d.school_id=?
      ORDER  BY d.name
    `, [req.user.school_id])
    res.json(drivers)
  } catch (err) { next(err) }
}

async function createDriver(req, res, next) {
  try {
    const { name, phone, license_no, bus_id } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })
    const [result] = await pool.execute(
      `INSERT INTO drivers (school_id, name, phone, license_no, bus_id) VALUES (?,?,?,?,?)`,
      [req.user.school_id, name, phone||null, license_no||null, bus_id||null]
    )
    const [rows] = await pool.execute('SELECT * FROM drivers WHERE id=?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function updateDriver(req, res, next) {
  try {
    const { name, phone, license_no, bus_id } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })
    const [own] = await pool.execute('SELECT id FROM drivers WHERE id=? AND school_id=?', [req.params.id, req.user.school_id])
    if (!own.length) return res.status(404).json({ message: 'Driver not found' })
    await pool.execute(
      `UPDATE drivers SET name=?, phone=?, license_no=?, bus_id=? WHERE id=? AND school_id=?`,
      [name, phone||null, license_no||null, bus_id||null, req.params.id, req.user.school_id]
    )
    const [rows] = await pool.execute('SELECT * FROM drivers WHERE id=?', [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function driverLogin(req, res, next) {
  try {
    const { driver_id, bus_id, route_id, login_method } = req.body
    if (!driver_id || !bus_id) return res.status(400).json({ message: 'driver_id and bus_id are required' })

    await pool.execute(
      `UPDATE driver_sessions SET status='Ended', logout_time=NOW() WHERE driver_id=? AND status='Active'`,
      [driver_id]
    )
    const [result] = await pool.execute(
      `INSERT INTO driver_sessions (driver_id, bus_id, route_id, login_method, status) VALUES (?,?,?,?,'Active')`,
      [driver_id, bus_id, route_id||null, login_method||'FaceID']
    )
    const [session] = await pool.execute(`
      SELECT ds.*, d.name AS driver_name, b.bus_number
      FROM driver_sessions ds
      JOIN drivers d ON d.id = ds.driver_id
      JOIN buses   b ON b.id = ds.bus_id
      WHERE ds.id=?
    `, [result.insertId])

    res.status(201).json({ message: 'Driver logged in successfully', session: session[0] })
  } catch (err) { next(err) }
}

async function scanStudent(req, res, next) {
  try {
    const { qr_code, rfid_tag, bus_id, driver_id, trip_type, latitude, longitude } = req.body
    if (!qr_code && !rfid_tag) return res.status(400).json({ message: 'qr_code or rfid_tag is required' })
    if (!trip_type) return res.status(400).json({ message: 'trip_type (Pickup/Drop) is required' })

    const searchVal = qr_code || rfid_tag
    const searchCol = qr_code ? 'st.qr_code' : 'st.rfid_tag'

   const [found] = await pool.execute(`
  SELECT st.*, s.name, s.class, s.roll_number,
         s.parent_name, s.parent_phone, s.area, s.school_id,
         rs.stop_name
  FROM student_transport st
  JOIN students s ON s.id = st.student_id
  LEFT JOIN route_stops rs ON rs.id = st.stop_id
  WHERE ${searchCol}=? AND st.status='Active'
`, [searchVal])

    if (!found.length) return res.status(404).json({ message: 'Student not found. Invalid QR/RFID.' })

    const student = found[0]
    const [result] = await pool.execute(`
      INSERT INTO transport_attendance
        (school_id, student_id, bus_id, route_id, driver_id, scan_type, trip_type, status, latitude, longitude)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      student.school_id, student.student_id,
      bus_id || student.bus_id,
      student.route_id,
      driver_id || null,
      qr_code ? 'QR' : 'RFID',
      trip_type, 'Boarded',
      latitude || null, longitude || null
    ])

    const [buses] = await pool.execute('SELECT bus_number FROM buses WHERE id=?', [bus_id || student.bus_id])
    const busNumber = buses[0]?.bus_number || 'Bus'
    const time      = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
    const action    = trip_type === 'Pickup' ? 'boarded' : 'dropped off from'
    const message   = `🚌 *Transport Update*\n\n*${student.name}* has ${action} *${busNumber}* at *${time}*.\n\n${trip_type === 'Pickup' ? '📍 Your child is on the way to school.' : '🏠 Your child has been dropped off safely.'}\n\n— CMR School Transport`

    let notified = false
    if (student.parent_phone) {
      const waResult = await whatsapp.sendText(student.parent_phone, message)
      notified = waResult.success

      await pool.execute(`
        INSERT INTO transport_notifications
          (school_id, student_id, attendance_id, parent_phone, message, channel, status)
        VALUES (?,?,?,?,?,'WhatsApp',?)
      `, [student.school_id, student.student_id, result.insertId, student.parent_phone, message, notified ? 'Sent' : 'Failed'])

      if (notified) {
        await pool.execute('UPDATE transport_attendance SET notified=1 WHERE id=?', [result.insertId])
      }
    }

    res.status(201).json({
  success: true,
  student: {
    name:         student.name,
    class:        student.class,
    roll_number:  student.roll_number,
    parent_name:  student.parent_name,
    parent_phone: student.parent_phone,
    area:         student.area,
    pickup_stop:  student.stop_name,

  },
  bus_number: busNumber,
  trip_type, time, notified, message,
})
  } catch (err) { next(err) }
}

async function getAttendance(req, res, next) {
  try {
    const { date, bus_id, trip_type, limit = 100, offset = 0 } = req.query
    const schoolId   = req.user.school_id
    const targetDate = date || new Date().toISOString().slice(0, 10)

    let where  = 'ta.school_id=? AND DATE(ta.scanned_at)=?'
    let params = [schoolId, targetDate]

    if (bus_id)    { where += ' AND ta.bus_id=?';    params.push(bus_id) }
    if (trip_type) { where += ' AND ta.trip_type=?'; params.push(trip_type) }

    const [records] = await pool.execute(`
      SELECT ta.*, s.name AS student_name, s.class, s.parent_phone,
             b.bus_number, d.name AS driver_name
      FROM   transport_attendance ta
      JOIN   students s  ON s.id  = ta.student_id
      JOIN   buses    b  ON b.id  = ta.bus_id
      LEFT JOIN drivers d ON d.id = ta.driver_id
      WHERE  ${where}
      ORDER  BY ta.scanned_at DESC
      LIMIT  ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)])

    const [[count]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM transport_attendance ta WHERE ${where}`, params)

    res.json({ records, total: count.total, date: targetDate })
  } catch (err) { next(err) }
}

async function enrollStudent(req, res, next) {
  try {
    const { student_id, route_id, bus_id, stop_id, rfid_tag } = req.body
    if (!student_id) return res.status(400).json({ message: 'student_id is required' })

    const qr_code = `STU-${student_id}-${Date.now()}`
    const [existing] = await pool.execute('SELECT id FROM student_transport WHERE student_id=?', [student_id])

    if (existing.length > 0) {
      await pool.execute(
        `UPDATE student_transport SET route_id=?, bus_id=?, stop_id=?, rfid_tag=?, status='Active', qr_code=? WHERE student_id=?`,
        [route_id||null, bus_id||null, stop_id||null, rfid_tag||null, qr_code, student_id]
      )
    } else {
      await pool.execute(
        `INSERT INTO student_transport (school_id, student_id, route_id, bus_id, stop_id, qr_code, rfid_tag) VALUES (?,?,?,?,?,?,?)`,
        [req.user.school_id, student_id, route_id||null, bus_id||null, stop_id||null, qr_code, rfid_tag||null]
      )
    }

    const [rows] = await pool.execute(`
      SELECT st.*, s.name, s.class, b.bus_number, r.route_name
      FROM student_transport st
      JOIN students s ON s.id = st.student_id
      LEFT JOIN buses b ON b.id = st.bus_id
      LEFT JOIN transport_routes r ON r.id = st.route_id
      WHERE st.student_id=?
    `, [student_id])

    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function updateBusLocation(req, res, next) {
  try {
    const { bus_id, driver_id, latitude, longitude, speed, heading } = req.body
    if (!bus_id || !latitude || !longitude) return res.status(400).json({ message: 'bus_id, latitude, longitude required' })
    await pool.execute(
      `INSERT INTO bus_location (bus_id, driver_id, latitude, longitude, speed, heading) VALUES (?,?,?,?,?,?)`,
      [bus_id, driver_id||null, latitude, longitude, speed||0, heading||0]
    )
    res.json({ success: true })
  } catch (err) { next(err) }
}

async function getBusLocation(req, res, next) {
  try {
    const [rows] = await pool.execute(`
      SELECT bl.*, b.bus_number, d.name AS driver_name
      FROM   bus_location bl
      JOIN   buses b ON b.id = bl.bus_id
      LEFT JOIN drivers d ON d.id = bl.driver_id
      WHERE  bl.bus_id=?
      ORDER  BY bl.recorded_at DESC LIMIT 1
    `, [req.params.bus_id])
    if (!rows.length) return res.status(404).json({ message: 'No location data for this bus' })
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function getNotifications(req, res, next) {
  try {
    const [rows] = await pool.execute(`
      SELECT tn.*, s.name AS student_name, s.class
      FROM   transport_notifications tn
      JOIN   students s ON s.id = tn.student_id
      WHERE  tn.school_id=?
      ORDER  BY tn.sent_at DESC LIMIT 50
    `, [req.user.school_id])
    res.json(rows)
  } catch (err) { next(err) }
}

async function getEnrolled(req, res, next) {
  try {
    const [rows] = await pool.execute(`
      SELECT st.*, 
             s.name AS student_name, s.class, s.roll_number,
             s.parent_name, s.parent_phone,
             b.bus_number, b.plate_number,
             r.route_name, r.start_time, r.end_time
      FROM student_transport st
      JOIN students s ON s.id = st.student_id
      LEFT JOIN buses b ON b.id = st.bus_id
      LEFT JOIN transport_routes r ON r.id = st.route_id
      WHERE st.school_id = ? AND st.status = 'Active'
      ORDER BY s.name
    `, [req.user.school_id])
    res.json(rows)
  } catch (err) { next(err) }
}
// ── ADD THESE TO ctrl_transport.js ──────────────────────────────────────────

// Feature 1: Start Drop Session — Admin triggers afternoon drop
// POST /api/transport/start-drop
async function startDropSession(req, res, next) {
  try {
    const schoolId = req.user.school_id

    // Get all active drivers for this school
    const [drivers] = await pool.execute(`
      SELECT d.id, d.name, d.phone, b.bus_number,
             COUNT(st.id) AS student_count
      FROM drivers d
      JOIN buses b ON b.id = d.bus_id
      JOIN student_transport st ON st.bus_id = d.bus_id AND st.status='Active'
      WHERE d.school_id = ? AND d.status = 'Active'
      GROUP BY d.id
    `, [schoolId])

    // Create drop session records
    for (const driver of drivers) {
      await pool.execute(`
        INSERT INTO driver_sessions
          (driver_id, bus_id, school_id, session_type, status, start_time)
        VALUES (?, ?, ?, 'Drop', 'Active', NOW())
        ON DUPLICATE KEY UPDATE status='Active', start_time=NOW()
      `, [driver.id, driver.bus_id, schoolId])
    }

    // Send WhatsApp to all drivers
    const whatsapp = require('../services/whatsapp')
    for (const driver of drivers) {
      const msg = `🚌 *Drop Time Alert!*\n\nHello *${driver.name}*,\n\nSchool has ended. Please start your afternoon drop route for *${driver.student_count} students* in *${driver.bus_number}*.\n\nOpen EnrollIQ Driver App to begin scanning.\n\n— School Transport`
      if (driver.phone) {
        await whatsapp.sendText(driver.phone, msg)
      }
    }

    res.json({
      success: true,
      message: `Drop session started. ${drivers.length} drivers notified.`,
      drivers: drivers.length,
    })
  } catch (err) { next(err) }
}

// Feature 2: Get students with pickup/drop locations for driver
// GET /api/driver/students-with-stops
async function getStudentsWithStops(req, res, next) {
  try {
    const driverId = req.driver.id

    // Get driver's bus
    const [driverInfo] = await pool.execute(
      'SELECT * FROM drivers WHERE id=?', [driverId]
    )
    if (!driverInfo.length) return res.status(404).json({ message: 'Driver not found' })

    const busId = driverInfo[0].bus_id
    if (!busId) return res.json({ students: [], route: null })

    // Get all students on this bus with their stops
    const [students] = await pool.execute(`
      SELECT
        st.id AS transport_id,
        st.student_id,
        st.qr_code,
        st.status AS transport_status,
        s.name AS student_name,
        s.class,
        s.roll_number,
        s.parent_name,
        s.parent_phone,
        s.address AS home_address,
        rs.stop_name AS pickup_stop,
        rs.pickup_time,
        rs.latitude AS stop_lat,
        rs.longitude AS stop_lng,
        r.route_name,
        -- Check if scanned today
        (SELECT COUNT(*) FROM transport_attendance ta
         WHERE ta.student_id = st.student_id
         AND DATE(ta.scanned_at) = CURDATE()
         AND ta.trip_type = 'Pickup') AS pickup_done,
        (SELECT COUNT(*) FROM transport_attendance ta
         WHERE ta.student_id = st.student_id
         AND DATE(ta.scanned_at) = CURDATE()
         AND ta.trip_type = 'Drop') AS drop_done
      FROM student_transport st
      JOIN students s ON s.id = st.student_id
      LEFT JOIN route_stops rs ON rs.id = st.stop_id
      LEFT JOIN transport_routes r ON r.id = st.route_id
      WHERE st.bus_id = ? AND st.status = 'Active'
      ORDER BY rs.stop_order, s.name
    `, [busId])

    res.json({ students, bus_id: busId })
  } catch (err) { next(err) }
}

// Feature 3: Prevent double boarding — add to scanStudent function
// Add this check INSIDE scanStudent, after finding the student:
/*
  // Check if already boarded on ANOTHER bus today
  const [alreadyBoarded] = await pool.execute(`
    SELECT ta.*, b.bus_number
    FROM transport_attendance ta
    JOIN buses b ON b.id = ta.bus_id
    WHERE ta.student_id = ?
    AND DATE(ta.scanned_at) = CURDATE()
    AND ta.trip_type = ?
    AND ta.bus_id != ?
  `, [student.student_id, trip_type, bus_id || student.bus_id])

  if (alreadyBoarded.length > 0) {
    return res.status(400).json({
      message: `Already ${trip_type === 'Pickup' ? 'boarded' : 'dropped'} on ${alreadyBoarded[0].bus_number} today`,
      already_scanned: true,
      bus_number: alreadyBoarded[0].bus_number,
    })
  }
*/

module.exports = {
  getDashboard, getBuses, createBus, updateBus,
  getRoutes, createRoute, updateRoute,
  getDrivers, createDriver, updateDriver,
  driverLogin, scanStudent,
  getAttendance, enrollStudent,
  updateBusLocation, getBusLocation,
  getNotifications, getEnrolled,
  startDropSession,getStudentsWithStops
}