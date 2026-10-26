/**
 * EnrollIQ — attendance controller (v2)
 * Save as:  backend/src/controllers/attendanceController.js   (replaces the old file)
 *
 *  roster        GET   /api/attendance/roster?class=&date=      students + saved status + approved-leave flag
 *  markBulk      POST  /api/attendance/mark-bulk                validated, one transaction, notifies parents once
 *  report        GET   /api/attendance/report?range=&date=&from=&to=&class=
 *  reportCsv     GET   /api/attendance/report.csv?…             Excel/CSV export of the per-student table
 *  listLeaves    GET   /api/attendance/leaves?status=
 *  decideLeave   PATCH /api/attendance/leaves/:id               approve / reject a parent's leave request
 *  + the older getAttendance, getStudentAttendance, getSummary, getHistory (kept so nothing else breaks)
 */
const { pool } = require('../db/pool')
const { notifyParent } = require('../services/notificationService')
const R = require('../utils/attendanceRange')

const DATE_COL = `DATE_FORMAT(ca.date,'%Y-%m-%d')`

// ───────────────────────── older endpoints (kept) ─────────────────────────

// GET /api/attendance?date=&class=
async function getAttendance(req, res, next) {
  try {
    const { date, class: cls, limit = 500 } = req.query
    const schoolId = req.user.school_id
    const targetDate = R.parseYMD(date) ? date : R.todayIST()

    let where = 'ca.school_id=? AND ca.date=?'
    const params = [schoolId, targetDate]
    if (cls && cls !== 'All') { where += ' AND s.class=?'; params.push(cls) }

    const [records] = await pool.execute(`
      SELECT ca.*, ${DATE_COL} AS date, s.name AS student_name, s.class, s.roll_number, s.parent_phone
      FROM   class_attendance ca JOIN students s ON s.id = ca.student_id
      WHERE  ${where}
      ORDER  BY s.class, s.name
      LIMIT  ?`, [...params, Math.min(parseInt(limit) || 500, 2000)])

    const c = R.emptyCounts()
    for (const r of records) { const k = R.STATUS_KEY[r.status]; if (k) c[k]++ }
    res.json({ records, date: targetDate,
      stats: { present: c.present, absent: c.absent, late: c.late, half_day: c.half_day, leave: c.leave, total: records.length } })
  } catch (err) { next(err) }
}

// GET /api/attendance/student/:id
async function getStudentAttendance(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { month } = req.query
    let where = 'ca.school_id=? AND ca.student_id=?'
    const params = [schoolId, req.params.id]
    if (month) { where += ` AND DATE_FORMAT(ca.date,'%Y-%m')=?`; params.push(month) }

    const [records] = await pool.execute(
      `SELECT ca.id, ca.student_id, ca.status, ca.notes, ${DATE_COL} AS date
       FROM class_attendance ca WHERE ${where} ORDER BY ca.date DESC LIMIT 400`, params)
    const c = R.emptyCounts()
    for (const r of records) { const k = R.STATUS_KEY[r.status]; if (k) c[k]++ }
    const total = c.present + c.late + c.half_day + c.absent
    res.json({ records, summary: { present: c.present, total, percentage: R.percentage(c) ?? 0, ...c } })
  } catch (err) { next(err) }
}

// GET /api/attendance/summary — today, class by class
async function getSummary(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const today = R.todayIST()
    const [byClass] = await pool.execute(`
      SELECT s.class, COUNT(*) AS total, ${R.AGG_SQL}
      FROM class_attendance ca JOIN students s ON s.id = ca.student_id
      WHERE ca.school_id=? AND ca.date=? GROUP BY s.class ORDER BY s.class`, [schoolId, today])
    const [[totalStudents]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM students WHERE school_id=? AND status='Active'`, [schoolId])
    const [[markedToday]] = await pool.execute(
      `SELECT COUNT(DISTINCT student_id) AS c FROM class_attendance WHERE school_id=? AND date=?`, [schoolId, today])
    const rows = byClass.map(b => ({ ...b, total: Number(b.total), ...R.numCounts(b) }))
    const tot = rows.reduce((a, b) => {
      for (const k of Object.keys(a)) a[k] += b[k]
      return a
    }, R.emptyCounts())
    res.json({
      date: today, by_class: rows,
      total_students: totalStudents.c, marked_today: markedToday.c,
      unmarked: Math.max(0, totalStudents.c - markedToday.c),
      today: { ...tot, percentage: R.percentage(tot) },
    })
  } catch (err) { next(err) }
}

// GET /api/attendance/history?from=&to=&class=  (old History tab — still served)
async function getHistory(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { from, to, class: cls } = req.query
    if (!R.parseYMD(from) || !R.parseYMD(to)) return res.status(400).json({ message: 'from and to dates are required' })
    const cf = cls && cls !== 'All' ? ' AND s.class=?' : ''
    const cp = cf ? [cls] : []
    const [days] = await pool.execute(`
      SELECT ${DATE_COL} AS date, COUNT(DISTINCT ca.student_id) AS marked_count, ${R.AGG_SQL}
      FROM class_attendance ca JOIN students s ON s.id = ca.student_id
      WHERE ca.school_id=? AND ca.date BETWEEN ? AND ? ${cf}
      GROUP BY ca.date ORDER BY ca.date DESC`, [schoolId, from, to, ...cp])
    const [[active]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM students s WHERE s.school_id=? AND s.status='Active' ${cf}`, [schoolId, ...cp])
    const rows = days.map(d => {
      const c = R.numCounts(d)
      return { date: d.date, marked_count: d.marked_count, ...c, total_active: active.c,
        is_complete: active.c > 0 && d.marked_count >= active.c, percentage: R.percentage(c) ?? 0 }
    })
    const sum = rows.reduce((a, d) => { for (const k of Object.keys(a)) a[k] += d[k]; return a }, R.emptyCounts())
    res.json({ days: rows, range: { from, to },
      summary: { total_days: rows.length, avg_attendance_pct: Math.round(R.percentage(sum) ?? 0), total_active: active.c } })
  } catch (err) { next(err) }
}

// ───────────────────────────── roster ─────────────────────────────────

// GET /api/attendance/roster?class=&date=
async function roster(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const cls = String(req.query.class || '')
    if (!cls || cls === 'All') return res.status(400).json({ message: 'class is required' })
    const date = R.parseYMD(req.query.date) ? req.query.date : R.todayIST()

    const [rows] = await pool.execute(`
      SELECT s.id, s.name, s.roll_number, s.class, ca.status, ca.notes, ca.source,
             (SELECT COUNT(*) FROM leave_requests lr
               WHERE lr.student_id = s.id AND lr.status='Approved' AND ? BETWEEN lr.from_date AND lr.to_date) AS on_leave
      FROM students s
      LEFT JOIN class_attendance ca ON ca.student_id = s.id AND ca.date = ?
      WHERE s.school_id=? AND s.status='Active' AND s.class=?
      ORDER BY s.name`, [date, date, schoolId, cls])

    const students = rows.map(r => ({
      id: r.id, name: r.name, roll_number: r.roll_number, class: r.class,
      status: r.status || null, notes: r.notes || '', on_leave: Number(r.on_leave) > 0,
      auto_leave: r.source === 'leave',
    }))
    res.json({ date, class: cls, students,
      already_marked: rows.some(r => r.status && r.source !== 'leave') })
  } catch (err) { next(err) }
}

// ───────────────────────────── mark-bulk ──────────────────────────────

// POST /api/attendance/mark-bulk   { date, attendance: [{ student_id, status, notes }] }
async function markBulk(req, res, next) {
  let conn
  try {
    const schoolId = req.user.school_id
    const { attendance } = req.body || {}
    if (!Array.isArray(attendance) || attendance.length === 0)
      return res.status(400).json({ message: 'attendance array is required' })
    if (attendance.length > 500)
      return res.status(400).json({ message: 'Too many students in one save (max 500)' })

    const today = R.todayIST()
    const date = req.body.date ? req.body.date : today
    if (!R.parseYMD(date)) return res.status(400).json({ message: 'Invalid date' })
    if (date > today) return res.status(400).json({ message: 'Attendance cannot be marked for a future date' })

    // validate + dedupe (last entry per student wins)
    const wanted = new Map()
    for (const rec of attendance) {
      const id = Number(rec?.student_id)
      const status = rec?.status || 'Present'
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid student_id' })
      if (!R.STATUSES.includes(status)) return res.status(400).json({ message: `Invalid status "${status}"` })
      const notes = rec?.notes ? String(rec.notes).slice(0, 500) : null
      wanted.set(id, { status, notes })
    }
    const ids = [...wanted.keys()]

    // only students that really belong to THIS school
    const [studs] = await pool.execute(
      `SELECT id, name, class, parent_phone FROM students WHERE school_id=? AND id IN (?)`, [schoolId, ids])
    const byId = new Map(studs.map(s => [s.id, s]))
    const skipped = ids.filter(id => !byId.has(id))
    const valid = ids.filter(id => byId.has(id))
    if (!valid.length) return res.status(400).json({ message: 'None of these students belong to your school' })

    const [prev] = await pool.execute(
      `SELECT student_id, status FROM class_attendance WHERE school_id=? AND date=? AND student_id IN (?)`,
      [schoolId, date, valid])
    const prevMap = new Map(prev.map(p => [p.student_id, p.status]))

    const rows = valid.map(id => [schoolId, id, byId.get(id).class, date, wanted.get(id).status, wanted.get(id).notes, req.user.id])
    conn = await pool.getConnection()
    await conn.beginTransaction()
    await conn.query(
      `INSERT INTO class_attendance (school_id, student_id, class_name, date, status, notes, marked_by) VALUES ?
       ON DUPLICATE KEY UPDATE status=VALUES(status), notes=VALUES(notes), marked_by=VALUES(marked_by),
                               class_name=VALUES(class_name), source=NULL`, [rows])
    await conn.commit()

    // parents are told once — only when the status CHANGES to Absent
    let notified = 0
    for (const id of valid) {
      const st = byId.get(id)
      if (wanted.get(id).status === 'Absent' && prevMap.get(id) !== 'Absent' && st.parent_phone) {
        await notifyParent({ schoolId, studentId: id, parentPhone: st.parent_phone, type: 'absent',
          title: `${st.name} marked absent`, body: `Marked absent on ${R.nice(date)}. If this is a mistake, please contact the school.`,
          link: 'attendance' })
        notified++
      }
    }
    res.json({ message: `Attendance saved for ${valid.length} students`, date, saved: valid.length, skipped, parents_notified: notified })
  } catch (err) {
    if (conn) { try { await conn.rollback() } catch {} }
    next(err)
  } finally { if (conn) conn.release() }
}

// ───────────────────────────── report ─────────────────────────────────

async function buildReport(schoolId, q, { studentLimit = 300 } = {}) {
  const r = R.resolveRange(q)
  const cls = q.class && q.class !== 'All' ? String(q.class) : null
  const threshold = Math.min(Math.max(Number(q.threshold) || 75, 1), 100)
  const cf = cls ? ' AND s.class=?' : ''
  const cp = cls ? [cls] : []
  const base = [schoolId, r.from, r.to, ...cp]
  const FROM = `FROM class_attendance ca JOIN students s ON s.id = ca.student_id
                WHERE ca.school_id=? AND ca.date BETWEEN ? AND ? ${cf}`

  const [[tot]] = await pool.query(`SELECT COUNT(*) AS records, COUNT(DISTINCT ca.date) AS days_marked, ${R.AGG_SQL} ${FROM}`, base)
  const totals = R.numCounts(tot)
  totals.percentage = R.percentage(totals)
  totals.records = Number(tot.records)
  totals.days_marked = Number(tot.days_marked)

  // trend: one bar per day for short ranges, per month for long ones
  const span = R.daysBetween(r.from, r.to) + 1
  const granularity = span <= 62 ? 'day' : 'month'
  const bucketSql = granularity === 'day' ? `DATE_FORMAT(ca.date,'%Y-%m-%d')` : `DATE_FORMAT(ca.date,'%Y-%m')`
  const [[active]] = await pool.query(
    `SELECT COUNT(*) AS c FROM students s WHERE s.school_id=? AND s.status='Active' ${cf}`, [schoolId, ...cp])
  const [bk] = await pool.query(
    `SELECT ${bucketSql} AS bucket, COUNT(DISTINCT ca.student_id) AS marked, ${R.AGG_SQL} ${FROM}
     GROUP BY bucket ORDER BY bucket ASC`, base)
  const buckets = bk.map(b => {
    const c = R.numCounts(b)
    return { bucket: b.bucket, marked: Number(b.marked), ...c, percentage: R.percentage(c),
      is_complete: granularity === 'day' && active.c > 0 && Number(b.marked) >= active.c }
  })

  const [bc] = await pool.query(
    `SELECT s.class AS class, COUNT(DISTINCT s.id) AS students, ${R.AGG_SQL} ${FROM} GROUP BY s.class ORDER BY s.class`, base)
  const by_class = bc.map(b => { const c = R.numCounts(b); return { class: b.class, students: Number(b.students), ...c, percentage: R.percentage(c) } })

  const [st] = await pool.query(
    `SELECT s.id, s.name, s.roll_number, s.class, COUNT(ca.id) AS marked, ${R.AGG_SQL}
     FROM students s
     LEFT JOIN class_attendance ca ON ca.student_id = s.id AND ca.date BETWEEN ? AND ?
     WHERE s.school_id=? AND (s.status='Active' OR ca.id IS NOT NULL) ${cf}
     GROUP BY s.id, s.name, s.roll_number, s.class`, [r.from, r.to, schoolId, ...cp])
  let students = st.map(s => { const c = R.numCounts(s); return { id: s.id, name: s.name, roll_number: s.roll_number, class: s.class,
    marked: Number(s.marked), ...c, percentage: R.percentage(c) } })
  students.sort((a, b) => (a.percentage ?? 1e9) - (b.percentage ?? 1e9) || String(a.name).localeCompare(String(b.name)))
  const low_count = students.filter(s => s.percentage !== null && s.percentage < threshold).length
  const student_total = students.length
  students = students.slice(0, studentLimit)

  return { range: r.range, from: r.from, to: r.to, label: r.label, class: cls || 'All', threshold,
    totals, granularity, buckets, total_active: active.c, by_class, students, student_total, low_count }
}

// GET /api/attendance/report
async function report(req, res, next) {
  try {
    res.json(await buildReport(req.user.school_id, req.query, { studentLimit: Math.min(Number(req.query.limit) || 300, 2000) }))
  } catch (err) { err.status === 400 ? res.status(400).json({ message: err.message }) : next(err) }
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s                       // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// GET /api/attendance/report.csv
async function reportCsv(req, res, next) {
  try {
    const d = await buildReport(req.user.school_id, req.query, { studentLimit: 20000 })
    const head = ['Roll No', 'Name', 'Class', 'Present', 'Absent', 'Late', 'Half Day', 'Leave', 'Days marked', 'Attendance %']
    const lines = [
      [`Attendance report`, d.label, `Class: ${d.class}`].map(csvCell).join(','),
      head.join(','),
      ...d.students.map(s => [s.roll_number, s.name, s.class, s.present, s.absent, s.late, s.half_day, s.leave, s.marked,
        s.percentage == null ? '' : s.percentage].map(csvCell).join(',')),
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${d.from}_to_${d.to}.csv"`)
    res.send('﻿' + lines.join('\r\n'))
  } catch (err) { err.status === 400 ? res.status(400).json({ message: err.message }) : next(err) }
}

// ───────────────────────────── leave requests ─────────────────────────

// GET /api/attendance/leaves?status=Pending|Approved|Rejected|All
async function listLeaves(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const status = ['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(req.query.status) ? req.query.status : (req.query.status === 'All' ? null : 'Pending')
    const [rows] = await pool.query(`
      SELECT lr.id, lr.student_id, DATE_FORMAT(lr.from_date,'%Y-%m-%d') AS from_date, DATE_FORMAT(lr.to_date,'%Y-%m-%d') AS to_date,
             lr.reason, lr.status, lr.remark, lr.created_at, s.name AS student_name, s.class, s.roll_number
      FROM leave_requests lr JOIN students s ON s.id = lr.student_id
      WHERE lr.school_id=? ${status ? 'AND lr.status=?' : ''}
      ORDER BY (lr.status='Pending') DESC, lr.from_date DESC, lr.id DESC LIMIT 200`, status ? [schoolId, status] : [schoolId])
    const [[p]] = await pool.query(`SELECT COUNT(*) AS c FROM leave_requests WHERE school_id=? AND status='Pending'`, [schoolId])
    res.json({ leaves: rows, pending_count: p.c })
  } catch (err) { next(err) }
}

// PATCH /api/attendance/leaves/:id   { status: 'Approved' | 'Rejected', remark }
async function decideLeave(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { status } = req.body || {}
    const remark = req.body?.remark ? String(req.body.remark).slice(0, 255) : null
    if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'status must be Approved or Rejected' })

    const [upd] = await pool.query(
      `UPDATE leave_requests SET status=?, remark=?, reviewed_by=?, reviewed_at=NOW()
       WHERE id=? AND school_id=? AND status='Pending'`, [status, remark, req.user.id, req.params.id, schoolId])
    if (!upd.affectedRows) {
      const [[ex]] = await pool.query(`SELECT status FROM leave_requests WHERE id=? AND school_id=?`, [req.params.id, schoolId])
      return ex ? res.status(409).json({ message: `This request is already ${ex.status}` })
                : res.status(404).json({ message: 'Leave request not found' })
    }
    const [[lr]] = await pool.query(
      `SELECT lr.*, DATE_FORMAT(lr.from_date,'%Y-%m-%d') AS f, DATE_FORMAT(lr.to_date,'%Y-%m-%d') AS t, s.name, s.class
       FROM leave_requests lr JOIN students s ON s.id=lr.student_id WHERE lr.id=?`, [req.params.id])

    let marked = 0
    if (status === 'Approved') {
      // write "Leave" for the days that have already happened (Sundays skipped). Present/Late/Half Day are never overwritten.
      const today = R.todayIST()
      const rows = []
      for (let d = lr.f; d <= lr.t && d <= today; d = R.addDays(d, 1)) {
        if (R.parseYMD(d).getUTCDay() === 0) continue
        rows.push([schoolId, lr.student_id, lr.class, d, 'Leave', lr.reason, req.user.id, 'leave'])
      }
      if (rows.length) {
        await pool.query(
          `INSERT INTO class_attendance (school_id, student_id, class_name, date, status, notes, marked_by, source) VALUES ?
           ON DUPLICATE KEY UPDATE
             source = IF(status IN ('Present','Late','Half Day'), source, 'leave'),
             notes  = IF(status IN ('Present','Late','Half Day'), notes, VALUES(notes)),
             status = IF(status IN ('Present','Late','Half Day'), status, 'Leave')`, [rows])
        marked = rows.length
      }
    }
    await notifyParent({ schoolId, studentId: lr.student_id, parentPhone: lr.parent_phone, type: 'leave',
      title: `Leave ${status.toLowerCase()} for ${lr.name}`,
      body: `${R.nice(lr.f)}${lr.f !== lr.t ? ' – ' + R.nice(lr.t) : ''}${remark ? ' · ' + remark : ''}`, link: 'attendance' })
    res.json({ message: `Leave ${status.toLowerCase()}`, status, days_marked: marked })
  } catch (err) { next(err) }
}

module.exports = { getAttendance, markBulk, getStudentAttendance, getSummary, getHistory,
  roster, report, reportCsv, listLeaves, decideLeave }