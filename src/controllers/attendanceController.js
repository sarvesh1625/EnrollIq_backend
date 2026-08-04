const { pool } = require('../db/pool')

// GET /api/attendance?date=&class=
async function getAttendance(req, res, next) {
  try {
    const { date, class: cls, limit = 100 } = req.query
    const schoolId  = req.user.school_id
    const targetDate = date || new Date().toISOString().slice(0, 10)

    let where  = 'ca.school_id=? AND ca.date=?'
    let params = [schoolId, targetDate]

    if (cls && cls !== 'All') {
      where += ' AND s.class=?'
      params.push(cls)
    }

    const [records] = await pool.execute(`
      SELECT ca.*, s.name AS student_name, s.class, s.roll_number, s.parent_phone
      FROM   class_attendance ca
      JOIN   students s ON s.id = ca.student_id
      WHERE  ${where}
      ORDER  BY s.class, s.name
      LIMIT  ?
    `, [...params, parseInt(limit)])

    // Stats
    const [[present]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM class_attendance ca JOIN students s ON s.id=ca.student_id WHERE ${where} AND ca.status='Present'`, params)
    const [[absent]]  = await pool.execute(
      `SELECT COUNT(*) AS c FROM class_attendance ca JOIN students s ON s.id=ca.student_id WHERE ${where} AND ca.status='Absent'`, params)
    const [[late]]    = await pool.execute(
      `SELECT COUNT(*) AS c FROM class_attendance ca JOIN students s ON s.id=ca.student_id WHERE ${where} AND ca.status='Late'`, params)

    res.json({ records, date: targetDate, stats: { present: present.c, absent: absent.c, late: late.c, total: records.length } })
  } catch (err) { next(err) }
}

// POST /api/attendance/mark-bulk — mark multiple students at once
async function markBulk(req, res, next) {
  try {
    const { date, attendance } = req.body
    // attendance = [{ student_id, status, notes }]
    const schoolId   = req.user.school_id
    const targetDate = date || new Date().toISOString().slice(0, 10)

    if (!attendance || !Array.isArray(attendance)) {
      return res.status(400).json({ message: 'attendance array is required' })
    }

    let success = 0
    for (const record of attendance) {
      const { student_id, status, notes } = record
      await pool.execute(`
        INSERT INTO class_attendance (school_id, student_id, date, status, notes, marked_by)
        VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE status=VALUES(status), notes=VALUES(notes), marked_by=VALUES(marked_by)
      `, [schoolId, student_id, targetDate, status || 'Present', notes || null, req.user.id])
      success++
    }

    res.json({ message: `Attendance marked for ${success} students`, date: targetDate })
  } catch (err) { next(err) }
}

// GET /api/attendance/student/:id — student attendance history
async function getStudentAttendance(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { month } = req.query

    let where  = 'school_id=? AND student_id=?'
    let params = [schoolId, req.params.id]

    if (month) {
      where += ' AND DATE_FORMAT(date,"%Y-%m")=?'
      params.push(month)
    }

    const [records] = await pool.execute(
      `SELECT * FROM class_attendance WHERE ${where} ORDER BY date DESC LIMIT 60`, params)

    const [[present]] = await pool.execute(`SELECT COUNT(*) AS c FROM class_attendance WHERE ${where} AND status='Present'`, params)
    const [[total]]   = await pool.execute(`SELECT COUNT(*) AS c FROM class_attendance WHERE ${where}`, params)

    res.json({
      records,
      summary: {
        present: present.c,
        total:   total.c,
        percentage: total.c > 0 ? Math.round((present.c / total.c) * 100) : 0
      }
    })
  } catch (err) { next(err) }
}

// GET /api/attendance/summary — class-wise summary for today
async function getSummary(req, res, next) {
  try {
    const schoolId   = req.user.school_id
    const today      = new Date().toISOString().slice(0, 10)

    const [byClass] = await pool.execute(`
      SELECT s.class,
             COUNT(*) AS total,
             SUM(CASE WHEN ca.status='Present' THEN 1 ELSE 0 END) AS present,
             SUM(CASE WHEN ca.status='Absent'  THEN 1 ELSE 0 END) AS absent,
             SUM(CASE WHEN ca.status='Late'    THEN 1 ELSE 0 END) AS late
      FROM   class_attendance ca
      JOIN   students s ON s.id = ca.student_id
      WHERE  ca.school_id=? AND ca.date=?
      GROUP  BY s.class
      ORDER  BY s.class
    `, [schoolId, today])

    const [[totalStudents]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM students WHERE school_id=? AND status='Active'`, [schoolId])
    const [[markedToday]]   = await pool.execute(
      `SELECT COUNT(DISTINCT student_id) AS c FROM class_attendance WHERE school_id=? AND date=?`, [schoolId, today])

    res.json({
      date: today,
      by_class: byClass,
      total_students:  totalStudents.c,
      marked_today:    markedToday.c,
      unmarked:        totalStudents.c - markedToday.c,
    })
  } catch (err) { next(err) }
}

module.exports = { getAttendance, markBulk, getStudentAttendance, getSummary }