/**
 * EnrollTeach — teacher helper endpoints
 * Save as: backend/src/controllers/teacherController.js
 * Everything else the teacher app needs already exists (attendance, exams, diary, ai-exams).
 */
const { pool } = require('../db/pool')
const { notifyParent } = require('../services/notificationService')

const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

// The classes this user teaches. Teachers: from teacher_assignments. Admin/others: every class (handy for testing).
async function assignedClasses(user) {
  const sid = user.school_id
  let rows
  if (user.role === 'teacher') {
    ;[rows] = await pool.execute(
      `SELECT class, COALESCE(section,'') AS section, GROUP_CONCAT(DISTINCT subject ORDER BY subject SEPARATOR '||') AS subjects
         FROM teacher_assignments WHERE user_id = ? GROUP BY class, COALESCE(section,'') ORDER BY class, section`, [user.id])
  } else {
    ;[rows] = await pool.execute(
      `SELECT class, COALESCE(section,'') AS section, '' AS subjects FROM students
        WHERE school_id = ? AND class IS NOT NULL AND class <> '' AND (archived = 0 OR archived IS NULL)
        GROUP BY class, COALESCE(section,'') ORDER BY class, section`, [sid])
  }
  return rows.map(r => ({ class: r.class, section: r.section || '', subjects: r.subjects ? r.subjects.split('||').filter(Boolean) : [] }))
}

function studentWhere(sid, cls, section) {
  let where = 's.school_id = ? AND s.class = ? AND (s.archived = 0 OR s.archived IS NULL)'
  const p = [sid, cls]
  if (section) { where += ' AND s.section = ?'; p.push(section) }
  return { where, p }
}

// GET /api/teacher/classes
async function myClasses(req, res, next) {
  try {
    const sid = req.user.school_id
    const list = await assignedClasses(req.user)
    for (const c of list) {
      const { where, p } = studentWhere(sid, c.class, c.section)
      const [[n]] = await pool.execute(`SELECT COUNT(*) AS n FROM students s WHERE ${where}`, p)
      c.student_count = n.n
    }
    let classTeacherOf = null
    try { const [[u]] = await pool.execute('SELECT class_teacher_of FROM users WHERE id=?', [req.user.id]); classTeacherOf = u?.class_teacher_of || null } catch {}
    res.json({ classes: list, class_teacher_of: classTeacherOf })
  } catch (err) { next(err) }
}

// GET /api/teacher/students?class=&section=&date=   (students + that day's attendance)
async function classStudents(req, res, next) {
  try {
    const sid = req.user.school_id
    const { class: cls, section = '' } = req.query
    const date = req.query.date || todayIST()
    if (!cls) return res.status(400).json({ message: 'class is required' })
    const { where, p } = studentWhere(sid, cls, section)
    const [students] = await pool.execute(
      `SELECT s.id, s.name, s.roll_number, s.class, s.section, s.parent_name, s.parent_phone, ca.status AS attendance
         FROM students s LEFT JOIN class_attendance ca ON ca.student_id = s.id AND ca.date = ?
        WHERE ${where} ORDER BY CAST(s.roll_number AS UNSIGNED), s.name`, [date, ...p])
    res.json({ students, date })
  } catch (err) { next(err) }
}

async function count(sql, params) { try { const [[r]] = await pool.execute(sql, params); return Number(r.n) || 0 } catch { return 0 } }

// GET /api/teacher/checklist
async function checklist(req, res, next) {
  try {
    const sid = req.user.school_id, uid = req.user.id, today = todayIST()
    const items = []
    const classes = await assignedClasses(req.user)
    for (const c of classes) {
      const { where, p } = studentWhere(sid, c.class, c.section)
      const label = c.class + (c.section ? '-' + c.section : '')
      const total  = await count(`SELECT COUNT(*) AS n FROM students s WHERE ${where}`, p)
      const marked = await count(`SELECT COUNT(*) AS n FROM class_attendance ca JOIN students s ON s.id=ca.student_id WHERE ca.date=? AND ${where}`, [today, ...p])
      items.push({ key: 'att-' + label, label: `Attendance · Class ${label}`, done: total > 0 && marked >= total,
                   detail: total === 0 ? 'No students' : `${marked}/${total} marked`, route: 'attendance', params: { class: c.class, section: c.section } })
      const posted = await count(`SELECT COUNT(*) AS n FROM class_posts WHERE school_id=? AND class_name=? AND posted_by=? AND post_date=?`, [sid, c.class, uid, today])
      items.push({ key: 'diary-' + label, label: `Diary or homework · Class ${label}`, done: posted > 0,
                   detail: posted > 0 ? `${posted} posted today` : 'Nothing posted yet', route: 'diary', params: { class: c.class, section: c.section } })
    }
    const marksEntered = await count(`SELECT COUNT(*) AS n FROM exam_marks WHERE school_id=? AND entered_by=?`, [sid, uid])
    const openExams = await count(`SELECT COUNT(*) AS n FROM exams WHERE school_id=? AND start_date <= ?`, [sid, today])
    if (openExams > 0) items.push({ key: 'marks', label: 'Enter exam marks', done: marksEntered > 0,
                   detail: marksEntered > 0 ? `${marksEntered} marks entered` : `${openExams} exam(s) running`, route: 'marks', params: {} })
    const papers = await count(`SELECT COUNT(*) AS n FROM question_papers WHERE school_id=? AND generated_by=? AND (status IS NULL OR status <> 'Approved')`, [sid, uid])
    items.push({ key: 'papers', label: 'Question papers to approve', done: papers === 0, detail: papers === 0 ? 'All approved' : `${papers} waiting`, route: 'ai', params: {} })
    const sheets = await count(`SELECT COUNT(*) AS n FROM answer_sheets WHERE school_id=? AND status='Graded'`, [sid])
    items.push({ key: 'sheets', label: 'Answer sheets to review', done: sheets === 0, detail: sheets === 0 ? 'Nothing waiting' : `${sheets} waiting`, route: 'ai', params: {} })
    res.json({ date: today, items, done: items.filter(i => i.done).length, total: items.length })
  } catch (err) { next(err) }
}

// POST /api/teacher/messages  { class, section, student_id, body }  → parents of a class, or one student's parent
async function sendParentMessage(req, res, next) {
  try {
    const sid = req.user.school_id
    const { class: cls, section = '', student_id, body } = req.body
    if (!body || !body.trim()) return res.status(400).json({ message: 'Message is empty' })
    let students
    if (student_id) {
      ;[students] = await pool.execute('SELECT id, name, parent_name, parent_phone FROM students WHERE id=? AND school_id=?', [student_id, sid])
    } else if (cls) {
      const { where, p } = studentWhere(sid, cls, section)
      ;[students] = await pool.execute(`SELECT s.id, s.name, s.parent_name, s.parent_phone FROM students s WHERE ${where}`, p)
    } else return res.status(400).json({ message: 'Choose a class or a student' })
    students = students.filter(s => s.parent_phone)
    if (!students.length) return res.status(400).json({ message: 'No parent phone numbers found' })
    const preview = body.length > 150 ? body.slice(0, 150) + '…' : body
    for (const s of students) {
      await pool.execute(
        `INSERT INTO messages (school_id, sent_by, student_id, recipient_name, recipient_phone, channel, body, status) VALUES (?,?,?,?,?,?,?, 'Sent')`,
        [sid, req.user.id, s.id, s.parent_name || ('Parent of ' + s.name), s.parent_phone, 'App', body])
      try { await notifyParent({ schoolId: sid, studentId: s.id, parentPhone: s.parent_phone, type: 'message', title: `Message from ${req.user.name || 'teacher'}`, body: preview }) } catch {}
    }
    res.status(201).json({ sent: students.length })
  } catch (err) { next(err) }
}

// GET /api/teacher/messages  — what this teacher sent (grouped by send)
async function sentMessages(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT m.body, MIN(m.created_at) AS created_at, COUNT(*) AS recipients,
              MIN(m.recipient_name) AS first_recipient, MIN(s.class) AS class, MIN(s.name) AS student_name
         FROM messages m LEFT JOIN students s ON s.id = m.student_id
        WHERE m.school_id = ? AND m.sent_by = ? AND m.channel = 'App'
        GROUP BY m.body, DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i') ORDER BY created_at DESC LIMIT 50`,
      [req.user.school_id, req.user.id])
    res.json({ messages: rows })
  } catch (err) { next(err) }
}

module.exports = { myClasses, classStudents, checklist, sendParentMessage, sentMessages }