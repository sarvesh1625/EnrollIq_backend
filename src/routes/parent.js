const router  = require('express').Router()
const { pool } = require('../db/pool')
const jwt      = require('jsonwebtoken')

// ── Parent Auth Middleware ────────────────────────────────────────────────────
function parentAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'parent') return res.status(403).json({ message: 'Not authorized' })
    req.parent = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Session expired. Please login again.' })
  }
}

// ── POST /api/parent/login ────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ message: 'Phone number required' })

    const cleanPhone = phone.replace(/\D/g,'').slice(-10)

    const [students] = await pool.execute(`
      SELECT DISTINCT s.parent_name, s.parent_phone, s.school_id
      FROM students s
      WHERE s.parent_phone = ? AND s.status = 'Active'
      LIMIT 1
    `, [cleanPhone])

    if (!students.length) {
      return res.status(401).json({ message: 'Phone number not registered. Contact school admin.' })
    }

    const parent = students[0]
    const token  = jwt.sign(
      { phone: cleanPhone, school_id: parent.school_id, role: 'parent' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({
      token,
      parent: {
        name:      parent.parent_name || 'Parent',
        phone:     parent.parent_phone,
        school_id: parent.school_id,
      }
    })
  } catch (err) { next(err) }
})

// ── GET /api/parent/children ──────────────────────────────────────────────────
router.get('/children', parentAuth, async (req, res, next) => {
  try {
    const { phone, school_id } = req.parent

    const [children] = await pool.execute(`
      SELECT
        s.id, s.name, s.class, s.roll_number,
        s.parent_name, s.parent_phone, s.area,
        b.bus_number, r.route_name,
        r.start_time AS pickup_time,
        rs.stop_name,
        d.name AS driver_name, d.phone AS driver_phone,
        st.qr_code,
        (SELECT ta.trip_type
         FROM transport_attendance ta
         WHERE ta.student_id = s.id
         AND DATE(ta.scanned_at) = CURDATE()
         ORDER BY ta.scanned_at DESC LIMIT 1) AS today_status,
        (SELECT ta.scanned_at
         FROM transport_attendance ta
         WHERE ta.student_id = s.id
         AND DATE(ta.scanned_at) = CURDATE()
         ORDER BY ta.scanned_at DESC LIMIT 1) AS last_scan_time
      FROM students s
      LEFT JOIN student_transport st ON st.student_id = s.id AND st.status = 'Active'
      LEFT JOIN buses b ON b.id = st.bus_id
      LEFT JOIN transport_routes r ON r.id = st.route_id
      LEFT JOIN route_stops rs ON rs.id = st.stop_id
      LEFT JOIN drivers d ON d.bus_id = st.bus_id AND d.school_id = s.school_id AND d.status = 'Active'
      WHERE s.parent_phone = ? AND s.school_id = ? AND s.status = 'Active'
      ORDER BY s.name
    `, [phone, school_id])

    res.json({ children })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/attendance ──────────────────────────────────────
router.get('/child/:id/attendance', parentAuth, async (req, res, next) => {
  try {
    const { phone } = req.parent
    const studentId  = req.params.id

    const [verify] = await pool.execute(
      'SELECT id FROM students WHERE id=? AND parent_phone=?',
      [studentId, phone]
    )
    if (!verify.length) return res.status(403).json({ message: 'Not authorized' })

    const [records] = await pool.execute(`
      SELECT ta.*, b.bus_number, d.name AS driver_name
      FROM transport_attendance ta
      LEFT JOIN buses b ON b.id = ta.bus_id
      LEFT JOIN drivers d ON d.id = ta.driver_id
      WHERE ta.student_id = ?
      ORDER BY ta.scanned_at DESC
      LIMIT 50
    `, [studentId])

    res.json({ records })
  } catch (err) { next(err) }
})

module.exports = router