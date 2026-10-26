/**
 * EnrollIQ — parent attendance reports + leave applications
 * Save as:  backend/src/routes/parentAttendance.js
 * Mount in server.js ABOVE the existing  app.use('/api/parent', …)  line:
 *     app.use('/api/parent/attendance', require('./routes/parentAttendance'))
 *
 *   GET    /api/parent/attendance/:id/report?range=week|month|year|custom|today&date=&from=&to=
 *   GET    /api/parent/attendance/:id/leaves
 *   POST   /api/parent/attendance/:id/leaves      { from_date, to_date, reason }
 *   DELETE /api/parent/attendance/:id/leaves/:leaveId     (cancel a Pending request)
 */
const router = require('express').Router()
const jwt = require('jsonwebtoken')
const { pool } = require('../db/pool')
const R = require('../utils/attendanceRange')

function parentAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'parent') return res.status(403).json({ message: 'Not authorized' })
    req.parent = decoded
    next()
  } catch { res.status(401).json({ message: 'Session expired. Please login again.' }) }
}
router.use(parentAuth)

// only the child's own parent (matched on phone) may see / change anything
async function ownChild(req, res, next) {
  const [rows] = await pool.query(
    'SELECT id, school_id, name, class, parent_phone FROM students WHERE id=? AND parent_phone=?', [req.params.id, req.parent.phone])
  if (!rows.length) return res.status(403).json({ message: 'Not authorized' })
  req.child = rows[0]
  next()
}

router.get('/:id/report', ownChild, async (req, res, next) => {
  try {
    const r = R.resolveRange(req.query)
    const [recs] = await pool.query(
      `SELECT DATE_FORMAT(date,'%Y-%m-%d') AS date, status, notes FROM class_attendance
       WHERE school_id=? AND student_id=? AND date BETWEEN ? AND ? ORDER BY date ASC`,
      [req.child.school_id, req.child.id, r.from, r.to])

    const totals = R.emptyCounts()
    const months = {}
    for (const x of recs) {
      const k = R.STATUS_KEY[x.status]; if (!k) continue
      totals[k]++
      const m = x.date.slice(0, 7)
      months[m] = months[m] || R.emptyCounts()
      months[m][k]++
    }
    res.json({
      student: { id: req.child.id, name: req.child.name, class: req.child.class },
      range: { range: r.range, from: r.from, to: r.to, label: r.label },
      totals: { ...totals, percentage: R.percentage(totals), counted: totals.present + totals.late + totals.half_day + totals.absent },
      months: Object.keys(months).sort().map(m => ({ month: m, ...months[m], percentage: R.percentage(months[m]) })),
      records: recs,
    })
  } catch (err) { err.status === 400 ? res.status(400).json({ message: err.message }) : next(err) }
})

const leaveSelect = `SELECT id, DATE_FORMAT(from_date,'%Y-%m-%d') AS from_date, DATE_FORMAT(to_date,'%Y-%m-%d') AS to_date,
                            reason, status, remark, created_at FROM leave_requests`

router.get('/:id/leaves', ownChild, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${leaveSelect} WHERE student_id=? ORDER BY id DESC LIMIT 30`, [req.child.id])
    res.json({ leaves: rows })
  } catch (err) { next(err) }
})

router.post('/:id/leaves', ownChild, async (req, res, next) => {
  try {
    const { from_date, to_date } = req.body || {}
    const reason = String(req.body?.reason || '').trim()
    if (!R.parseYMD(from_date) || !R.parseYMD(to_date)) return res.status(400).json({ message: 'Please enter valid dates (YYYY-MM-DD)' })
    if (to_date < from_date) return res.status(400).json({ message: '"To" date must be on or after the "From" date' })
    const today = R.todayIST()
    if (from_date < R.addDays(today, -7)) return res.status(400).json({ message: 'Leave can only be applied for the last 7 days or later' })
    if (R.daysBetween(from_date, to_date) > 30) return res.status(400).json({ message: 'One request can cover at most 31 days' })
    if (reason.length < 3) return res.status(400).json({ message: 'Please write a short reason' })
    if (reason.length > 500) return res.status(400).json({ message: 'Reason is too long (max 500 characters)' })

    const [[pend]] = await pool.query(`SELECT COUNT(*) AS c FROM leave_requests WHERE student_id=? AND status='Pending'`, [req.child.id])
    if (pend.c >= 5) return res.status(429).json({ message: 'You already have 5 requests waiting for approval' })
    const [[overlap]] = await pool.query(
      `SELECT COUNT(*) AS c FROM leave_requests WHERE student_id=? AND status IN ('Pending','Approved') AND from_date<=? AND to_date>=?`,
      [req.child.id, to_date, from_date])
    if (overlap.c) return res.status(409).json({ message: 'There is already a leave request for some of these dates' })

    const [ins] = await pool.query(
      `INSERT INTO leave_requests (school_id, student_id, parent_phone, from_date, to_date, reason) VALUES (?,?,?,?,?,?)`,
      [req.child.school_id, req.child.id, req.child.parent_phone, from_date, to_date, reason])
    const [[row]] = await pool.query(`${leaveSelect} WHERE id=?`, [ins.insertId])
    res.status(201).json({ message: 'Leave request sent to the school', leave: row })
  } catch (err) { next(err) }
})

router.delete('/:id/leaves/:leaveId', ownChild, async (req, res, next) => {
  try {
    const [u] = await pool.query(
      `UPDATE leave_requests SET status='Cancelled' WHERE id=? AND student_id=? AND status='Pending'`, [req.params.leaveId, req.child.id])
    if (!u.affectedRows) return res.status(409).json({ message: 'Only a request that is still waiting can be cancelled' })
    res.json({ message: 'Request cancelled' })
  } catch (err) { next(err) }
})

module.exports = router