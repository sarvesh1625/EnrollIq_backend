/**
 * EnrollIQ — Teacher app, Phase B endpoints (read-only, school-scoped)
 * Save as:  backend/src/controllers/teacherPlusController.js
 *
 * Everything here only READS existing tables (class_posts, class_attendance, exams, exam_marks,
 * subjects, report_cards, students, notifications, messages, teacher_assignments, classes, users).
 * Nothing is created or changed in the database.
 *
 * A teacher only sees the classes assigned to them (teacher_assignments / classes.teacher_id /
 * users.class_teacher_of). admin / chairman / principal see every class of their school.
 */
const { pool } = require('../db/pool')

const ADMIN_ROLES = ['admin', 'chairman', 'principal', 'super_admin']
const norm = (v) => String(v ?? '').trim().toLowerCase()
const gradeOf = (p) => p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B+' : p >= 60 ? 'B' : p >= 50 ? 'C' : p >= 35 ? 'D' : 'F'
const round1 = (n) => Math.round(n * 10) / 10
const pct = (a, b) => (b > 0 ? round1((a / b) * 100) : 0)
const ymd = (d) => new Date(d).toISOString().slice(0, 10)
const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fail = (res, e) => { console.error('[teacherPlus]', e.message); res.status(500).json({ message: 'Something went wrong. Please try again.' }) }

// attendance status buckets (works for Present/present/P, Absent/absent/A, Late/late/L)
const IS_P = "LOWER(LEFT(ca.status,1))='p'"
const IS_L = "LOWER(LEFT(ca.status,1))='l'"
const IS_A = "LOWER(LEFT(ca.status,1))='a'"

/* classes this user may see: null = all (admin), otherwise [{class, section}] */
async function myClasses(req) {
  if (ADMIN_ROLES.includes(req.user.role)) return null
  const id = req.user.id, out = []
  const [a] = await pool.query('SELECT class, section FROM teacher_assignments WHERE user_id=?', [id])
  a.forEach(r => out.push({ class: r.class, section: r.section || '' }))
  const [c] = await pool.query('SELECT name, section FROM classes WHERE school_id=? AND teacher_id=?', [req.user.school_id, id])
  c.forEach(r => out.push({ class: r.name, section: r.section || '' }))
  const [u] = await pool.query('SELECT class_teacher_of FROM users WHERE id=?', [id])
  const ct = u[0] && u[0].class_teacher_of
  if (ct) { const m = String(ct).trim().match(/^(.*?)[\s\-/]+([A-Za-z0-9]{1,3})$/); out.push(m ? { class: m[1].trim(), section: m[2] } : { class: String(ct).trim(), section: '' }) }
  return out
}
const canSee = (list, cls, sec) => list === null || list.some(x => norm(x.class) === norm(cls) && (!x.section || !sec || norm(x.section) === norm(sec)))

/* SQL fragment: students.class/section restricted to my classes */
function classFilter(list, alias = 's') {
  if (list === null) return { sql: '1=1', args: [] }
  if (!list.length) return { sql: '1=0', args: [] }
  const parts = [], args = []
  list.forEach(x => {
    if (x.section) { parts.push(`(LOWER(${alias}.class)=? AND LOWER(${alias}.section)=?)`); args.push(norm(x.class), norm(x.section)) }
    else { parts.push(`(LOWER(${alias}.class)=?)`); args.push(norm(x.class)) }
  })
  return { sql: '(' + parts.join(' OR ') + ')', args }
}

/* ───────────────────────── GET /activity ───────────────────────── */
exports.activity = async (req, res) => {
  try {
    const sid = req.user.school_id, me = req.user.id, limit = Math.min(Number(req.query.limit) || 15, 40)
    const [posts] = await pool.query(
      `SELECT id, post_type, title, class_name, section, created_at FROM class_posts WHERE school_id=? AND posted_by=? ORDER BY created_at DESC LIMIT 10`, [sid, me])
    const [att] = await pool.query(
      `SELECT ca.class_name, ca.date, COUNT(*) AS n, SUM(${IS_P}) AS present, SUM(${IS_A}) AS absent, SUM(${IS_L}) AS late, MAX(ca.created_at) AS at
         FROM class_attendance ca WHERE ca.school_id=? AND ca.marked_by=? GROUP BY ca.class_name, ca.date ORDER BY at DESC LIMIT 8`, [sid, me])
    const [marks] = await pool.query(
      `SELECT e.name AS exam, COALESCE(sb.name,'Subject') AS subject, e.class_name, COUNT(*) AS n, MAX(m.created_at) AS at
         FROM exam_marks m JOIN exams e ON e.id=m.exam_id LEFT JOIN subjects sb ON sb.id=m.subject_id
        WHERE m.school_id=? AND m.entered_by=? GROUP BY m.exam_id, m.subject_id, e.name, sb.name, e.class_name ORDER BY at DESC LIMIT 8`, [sid, me])
    const [msgs] = await pool.query(
      `SELECT body, COUNT(*) AS n, MAX(sent_at) AS at FROM messages WHERE school_id=? AND sent_by=? GROUP BY body, DATE_FORMAT(sent_at,'%Y-%m-%d %H:%i') ORDER BY at DESC LIMIT 6`, [sid, me])

    const items = []
    posts.forEach(p => items.push({ type: p.post_type === 'homework' ? 'homework' : p.post_type === 'activity' ? 'activity' : 'diary', icon: p.post_type === 'homework' ? 'clipboard' : 'book', title: p.post_type === 'homework' ? 'Homework posted' : p.post_type === 'activity' ? 'Activity posted' : 'Diary posted', detail: `${p.title}${p.class_name ? ' · ' + p.class_name + (p.section ? '-' + p.section : '') : ''}`, at: p.created_at }))
    att.forEach(a => items.push({ type: 'attendance', icon: 'checkbox', title: 'Attendance marked', detail: `${a.class_name} · ${a.present || 0} present, ${a.absent || 0} absent${a.late ? ', ' + a.late + ' late' : ''}`, at: a.at }))
    marks.forEach(m => items.push({ type: 'marks', icon: 'document-text', title: 'Marks entered', detail: `${m.exam} · ${m.subject} · ${m.n} students`, at: m.at }))
    msgs.forEach(m => items.push({ type: 'message', icon: 'chatbubble-ellipses', title: 'Message sent', detail: `${String(m.body).slice(0, 70)}${m.n > 1 ? ' · ' + m.n + ' parents' : ''}`, at: m.at }))
    items.sort((a, b) => new Date(b.at) - new Date(a.at))
    res.json(items.slice(0, limit))
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /overview  (My Classes) ───────────────────────── */
exports.overview = async (req, res) => {
  try {
    const sid = req.user.school_id, list = await myClasses(req), today = todayIST()
    const f = classFilter(list)
    const [groups] = await pool.query(
      `SELECT s.class, s.section, COUNT(*) AS students FROM students s
        WHERE s.school_id=? AND LOWER(s.status)='active' AND COALESCE(s.archived,0)=0 AND ${f.sql} GROUP BY s.class, s.section ORDER BY s.class, s.section`, [sid, ...f.args])
    const [marked] = await pool.query(
      `SELECT s.class, s.section, COUNT(*) AS n, SUM(${IS_P}) AS present, SUM(${IS_A}) AS absent, SUM(${IS_L}) AS late
         FROM class_attendance ca JOIN students s ON s.id=ca.student_id
        WHERE ca.school_id=? AND ca.date=? AND ${f.sql} GROUP BY s.class, s.section`, [sid, today, ...f.args])
    const key = (c, s) => norm(c) + '|' + norm(s)
    const mk = {}; marked.forEach(m => { mk[key(m.class, m.section)] = m })
    res.json({
      date: today,
      classes: groups.map(g => { const m = mk[key(g.class, g.section)]; return { class: g.class, section: g.section || '', students: g.students, attendance_marked: !!m, present: m ? Number(m.present) : 0, absent: m ? Number(m.absent) : 0, late: m ? Number(m.late) : 0 } }),
    })
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /attendance/records ───────────────────────── */
exports.attendanceRecords = async (req, res) => {
  try {
    const sid = req.user.school_id, { class: cls, section = '' } = req.query
    if (!cls) return res.status(400).json({ message: 'class is required' })
    const list = await myClasses(req)
    if (!canSee(list, cls, section)) return res.status(403).json({ message: 'This class is not assigned to you.' })
    const days = Math.min(Number(req.query.days) || 30, 120)
    const [rows] = await pool.query(
      `SELECT ca.date, COUNT(*) AS total, SUM(${IS_P}) AS present, SUM(${IS_A}) AS absent, SUM(${IS_L}) AS late
         FROM class_attendance ca JOIN students s ON s.id=ca.student_id
        WHERE ca.school_id=? AND LOWER(s.class)=? AND (?='' OR LOWER(s.section)=?) AND ca.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY ca.date ORDER BY ca.date DESC`, [sid, norm(cls), norm(section), norm(section), days])
    res.json(rows.map(r => ({ date: ymd(r.date), total: r.total, present: Number(r.present), absent: Number(r.absent), late: Number(r.late), pct: pct(Number(r.present) + Number(r.late), r.total) })))
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /attendance/day ───────────────────────── */
exports.attendanceDay = async (req, res) => {
  try {
    const sid = req.user.school_id, { class: cls, section = '', date } = req.query
    if (!cls || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ message: 'class and date (YYYY-MM-DD) are required' })
    const list = await myClasses(req)
    if (!canSee(list, cls, section)) return res.status(403).json({ message: 'This class is not assigned to you.' })
    const [rows] = await pool.query(
      `SELECT s.id AS student_id, s.name, s.roll_number, ca.status FROM class_attendance ca JOIN students s ON s.id=ca.student_id
        WHERE ca.school_id=? AND ca.date=? AND LOWER(s.class)=? AND (?='' OR LOWER(s.section)=?) ORDER BY CAST(s.roll_number AS UNSIGNED), s.name`,
      [sid, date, norm(cls), norm(section), norm(section)])
    res.json(rows)
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /attendance/summary ───────────────────────── */
exports.attendanceSummary = async (req, res) => {
  try {
    const sid = req.user.school_id, { class: cls, section = '' } = req.query
    if (!cls) return res.status(400).json({ message: 'class is required' })
    const list = await myClasses(req)
    if (!canSee(list, cls, section)) return res.status(403).json({ message: 'This class is not assigned to you.' })
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : todayIST().slice(0, 7)
    const from = month + '-01'
    const [rows] = await pool.query(
      `SELECT s.id AS student_id, s.name, s.roll_number,
              SUM(${IS_P}) AS present, SUM(${IS_A}) AS absent, SUM(${IS_L}) AS late, COUNT(ca.id) AS marked
         FROM students s LEFT JOIN class_attendance ca ON ca.student_id=s.id AND ca.date >= ? AND ca.date < DATE_ADD(?, INTERVAL 1 MONTH)
        WHERE s.school_id=? AND LOWER(s.status)='active' AND COALESCE(s.archived,0)=0 AND LOWER(s.class)=? AND (?='' OR LOWER(s.section)=?)
        GROUP BY s.id, s.name, s.roll_number ORDER BY CAST(s.roll_number AS UNSIGNED), s.name`, [from, from, sid, norm(cls), norm(section), norm(section)])
    const [wd] = await pool.query(
      `SELECT COUNT(DISTINCT ca.date) AS d FROM class_attendance ca JOIN students s ON s.id=ca.student_id
        WHERE ca.school_id=? AND ca.date >= ? AND ca.date < DATE_ADD(?, INTERVAL 1 MONTH) AND LOWER(s.class)=? AND (?='' OR LOWER(s.section)=?)`, [sid, from, from, norm(cls), norm(section), norm(section)])
    const students = rows.map(r => { const p = Number(r.present || 0), a = Number(r.absent || 0), l = Number(r.late || 0), m = Number(r.marked || 0); return { student_id: r.student_id, name: r.name, roll_number: r.roll_number, present: p, absent: a, late: l, marked: m, pct: m ? pct(p + l, m) : null } })
    const withData = students.filter(s => s.pct !== null)
    const tot = students.reduce((t, s) => ({ p: t.p + s.present + s.late, m: t.m + s.marked }), { p: 0, m: 0 })
    res.json({
      month, working_days: wd[0].d, students_count: students.length,
      average_pct: pct(tot.p, tot.m),
      low_attendance: withData.filter(s => s.pct < 75).sort((a, b) => a.pct - b.pct),
      students,
    })
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /students/:id/profile ───────────────────────── */
async function loadStudent(req, res) {
  const [r] = await pool.query('SELECT * FROM students WHERE id=? AND school_id=?', [req.params.id, req.user.school_id])
  const st = r[0]
  if (!st) { res.status(404).json({ message: 'Student not found' }); return null }
  const list = await myClasses(req)
  if (!canSee(list, st.class, st.section)) { res.status(403).json({ message: 'This student is not in your class.' }); return null }
  return st
}

exports.studentProfile = async (req, res) => {
  try {
    const st = await loadStudent(req, res); if (!st) return
    const sid = req.user.school_id
    // attendance, last 365 days
    const [a] = await pool.query(
      `SELECT SUM(${IS_P}) AS present, SUM(${IS_A}) AS absent, SUM(${IS_L}) AS late, COUNT(*) AS total FROM class_attendance ca
        WHERE ca.school_id=? AND ca.student_id=? AND ca.date >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)`, [sid, st.id])
    const A = a[0], present = Number(A.present || 0), absent = Number(A.absent || 0), late = Number(A.late || 0)
    // per-exam results
    const [ex] = await pool.query(
      `SELECT e.id AS exam_id, e.name, e.exam_type, e.start_date, SUM(m.marks) AS got, SUM(m.max_marks) AS max
         FROM exam_marks m JOIN exams e ON e.id=m.exam_id WHERE m.school_id=? AND m.student_id=? GROUP BY e.id, e.name, e.exam_type, e.start_date ORDER BY e.start_date DESC, e.id DESC`, [sid, st.id])
    const exams = ex.map(x => ({ exam_id: x.exam_id, name: x.name, exam_type: x.exam_type, date: x.start_date ? ymd(x.start_date) : null, total: Number(x.got), max: Number(x.max), pct: pct(Number(x.got), Number(x.max)), grade: gradeOf(pct(Number(x.got), Number(x.max))) }))
    const myGot = ex.reduce((t, x) => t + Number(x.got), 0), myMax = ex.reduce((t, x) => t + Number(x.max), 0)
    const avg = pct(myGot, myMax)
    // class rank by overall average of everyone in the same class + section
    const [peers] = await pool.query(
      `SELECT s.id, SUM(m.marks) AS got, SUM(m.max_marks) AS max FROM students s JOIN exam_marks m ON m.student_id=s.id
        WHERE s.school_id=? AND LOWER(s.status)='active' AND LOWER(s.class)=? AND LOWER(COALESCE(s.section,''))=? GROUP BY s.id`, [sid, norm(st.class), norm(st.section)])
    const scored = peers.map(p => ({ id: p.id, pct: Number(p.max) ? Number(p.got) / Number(p.max) : 0 })).sort((x, y) => y.pct - x.pct)
    const idx = scored.findIndex(x => x.id === st.id)
    const [sj] = await pool.query(
      `SELECT COALESCE(sb.name,'Subject') AS subject, AVG(m.marks / NULLIF(m.max_marks,0) * 100) AS pct FROM exam_marks m LEFT JOIN subjects sb ON sb.id=m.subject_id
        WHERE m.school_id=? AND m.student_id=? GROUP BY m.subject_id, sb.name ORDER BY pct DESC`, [sid, st.id])
    res.json({
      student: { id: st.id, name: st.name, class: st.class, section: st.section || '', roll_number: st.roll_number, dob: st.dob ? ymd(st.dob) : null, parent_name: st.parent_name, parent_phone: st.parent_phone, parent_email: st.parent_email, area: st.area, status: st.status },
      attendance: { present, absent, late, total: Number(A.total || 0), pct: pct(present + late, Number(A.total || 0)) },
      academics: { average_pct: avg, grade: exams.length ? gradeOf(avg) : null, exams_count: exams.length, rank: idx >= 0 && exams.length ? idx + 1 : null, class_size: scored.length },
      exams,
      subjects: sj.map(x => ({ subject: x.subject, pct: round1(Number(x.pct)), grade: gradeOf(Number(x.pct)) })),
    })
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /students/:id/report-card ───────────────────────── */
exports.studentReportCard = async (req, res) => {
  try {
    const st = await loadStudent(req, res); if (!st) return
    const sid = req.user.school_id
    const [exams] = await pool.query(
      `SELECT DISTINCT e.id, e.name, e.exam_type, e.start_date FROM exam_marks m JOIN exams e ON e.id=m.exam_id WHERE m.school_id=? AND m.student_id=? ORDER BY e.start_date DESC, e.id DESC`, [sid, st.id])
    if (!exams.length) return res.json({ student: { id: st.id, name: st.name, class: st.class, section: st.section || '', roll_number: st.roll_number }, exams: [], card: null })
    const examId = Number(req.query.exam_id) || exams[0].id
    const ex = exams.find(x => x.id === examId)
    if (!ex) return res.status(404).json({ message: 'No marks for this exam.' })
    const [rows] = await pool.query(
      `SELECT COALESCE(sb.name,'Subject') AS subject, m.marks, m.max_marks, m.grade, m.remarks FROM exam_marks m LEFT JOIN subjects sb ON sb.id=m.subject_id
        WHERE m.school_id=? AND m.student_id=? AND m.exam_id=? ORDER BY sb.name`, [sid, st.id, examId])
    const subjects = rows.map(r => { const p = pct(Number(r.marks), Number(r.max_marks)); return { subject: r.subject, marks: Number(r.marks), max_marks: Number(r.max_marks), pct: p, grade: r.grade || gradeOf(p), remarks: r.remarks || '' } })
    const got = subjects.reduce((t, x) => t + x.marks, 0), max = subjects.reduce((t, x) => t + x.max_marks, 0)
    const [rc] = await pool.query('SELECT * FROM report_cards WHERE school_id=? AND student_id=? AND exam_id=? ORDER BY generated_at DESC LIMIT 1', [sid, st.id, examId])
    const saved = rc[0]
    // live rank among classmates for this exam (used when no report card has been generated yet)
    const [peers] = await pool.query(
      `SELECT m.student_id, SUM(m.marks) AS got FROM exam_marks m JOIN students s ON s.id=m.student_id
        WHERE m.school_id=? AND m.exam_id=? AND LOWER(s.class)=? AND LOWER(COALESCE(s.section,''))=? GROUP BY m.student_id ORDER BY got DESC`, [sid, examId, norm(st.class), norm(st.section)])
    const liveRank = peers.findIndex(p => p.student_id === st.id) + 1
    res.json({
      student: { id: st.id, name: st.name, class: st.class, section: st.section || '', roll_number: st.roll_number, parent_name: st.parent_name },
      exams: exams.map(x => ({ id: x.id, name: x.name })),
      card: {
        exam_id: examId, exam: ex.name, exam_type: ex.exam_type, subjects,
        total: got, max_total: max, percentage: pct(got, max), grade: gradeOf(pct(got, max)),
        rank: (saved && saved.rank_in_class) || liveRank || null, class_size: peers.length,
        attendance_pct: saved ? Number(saved.attendance_pct) : null, remarks: saved ? saved.remarks : '',
        generated: !!saved, generated_at: saved ? saved.generated_at : null,
      },
    })
  } catch (e) { fail(res, e) }
}

/* ───────────────────────── GET /notifications ─────────────────────────
 * Two kinds, merged newest first:
 *   • "alert"  – things that need the teacher (attendance not marked today, exams coming up, homework due soon)
 *   • "sent"   – what parents were notified about, for the teacher's own classes                               */
exports.notifications = async (req, res) => {
  try {
    const sid = req.user.school_id, list = await myClasses(req), today = todayIST()
    const items = []
    const f = classFilter(list)

    // 1. attendance not marked today
    const [groups] = await pool.query(
      `SELECT s.class, s.section, COUNT(*) AS n FROM students s WHERE s.school_id=? AND LOWER(s.status)='active' AND COALESCE(s.archived,0)=0 AND ${f.sql} GROUP BY s.class, s.section`, [sid, ...f.args])
    const [done] = await pool.query(
      `SELECT DISTINCT s.class, s.section FROM class_attendance ca JOIN students s ON s.id=ca.student_id WHERE ca.school_id=? AND ca.date=? AND ${f.sql}`, [sid, today, ...f.args])
    const doneSet = new Set(done.map(d => norm(d.class) + '|' + norm(d.section)))
    const hour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours()
    if (hour >= 9) groups.forEach(g => { if (!doneSet.has(norm(g.class) + '|' + norm(g.section))) items.push({ kind: 'alert', icon: 'checkbox', color: 'amber', title: 'Attendance pending', detail: `Class ${g.class}${g.section ? '-' + g.section : ''} · ${g.n} students not marked today`, at: new Date().toISOString(), action: '/attendance' }) })

    // 2. exams in the next 7 days
    const [ex] = await pool.query(`SELECT id, name, class_name, start_date FROM exams WHERE school_id=? AND start_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) ORDER BY start_date LIMIT 10`, [sid])
    ex.filter(e => !e.class_name || canSee(list, e.class_name, '')).forEach(e => items.push({ kind: 'alert', icon: 'document-text', color: 'violet', title: 'Exam coming up', detail: `${e.name}${e.class_name ? ' · Class ' + e.class_name : ''} · ${ymd(e.start_date)}`, at: new Date(e.start_date).toISOString(), action: '/exams' }))

    // 3. my homework due in the next 3 days
    const [hw] = await pool.query(`SELECT title, class_name, section, due_date FROM class_posts WHERE school_id=? AND posted_by=? AND post_type='homework' AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY) ORDER BY due_date LIMIT 10`, [sid, req.user.id])
    hw.forEach(h => items.push({ kind: 'alert', icon: 'clipboard', color: 'cyan', title: 'Homework due soon', detail: `${h.title} · ${h.class_name}${h.section ? '-' + h.section : ''} · due ${ymd(h.due_date)}`, at: new Date(h.due_date).toISOString(), action: '/diary' }))

    // 4. recent parent notifications for my classes
    const [nt] = await pool.query(
      `SELECT n.title, n.body, n.type, n.created_at, s.name AS student, s.class, s.section FROM notifications n JOIN students s ON s.id=n.student_id
        WHERE n.school_id=? AND ${f.sql} ORDER BY n.created_at DESC LIMIT 25`, [sid, ...f.args])
    nt.forEach(n => items.push({ kind: 'sent', icon: 'notifications', color: 'green', title: n.title, detail: `${n.student} · ${n.class}${n.section ? '-' + n.section : ''}`, at: n.created_at, action: null }))

    items.sort((a, b) => (a.kind === b.kind ? new Date(b.at) - new Date(a.at) : a.kind === 'alert' ? -1 : 1))
    res.json(items)
  } catch (e) { fail(res, e) }
}