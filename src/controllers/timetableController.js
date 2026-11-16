/**
 * EnrollIQ — class timetable
 * Save as:  backend/src/controllers/timetableController.js
 *
 * Admin / chairman / principal build the timetable per class on the website.
 * Teachers read their own periods in the app (GET /me).
 */
const { pool } = require('../db/pool')

const EDIT_ROLES = ['admin', 'chairman', 'principal']
const norm = (v) => String(v ?? '').trim()
const TIME = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/
const fail = (res, e) => { console.error('[timetable]', e.message); res.status(500).json({ message: 'Something went wrong. Please try again.' }) }
const canEdit = (req, res) => { if (!EDIT_ROLES.includes(req.user.role)) { res.status(403).json({ message: 'Only the school admin can change the timetable.' }); return false } return true }
const hhmm = (t) => (t ? String(t).slice(0, 5) : null)
const istDow = () => { const d = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay(); return d === 0 ? 7 : d }   // 1..7

/* GET /options — what the admin can pick from */
exports.options = async (req, res) => {
  try {
    const sid = req.user.school_id
    const [cls] = await pool.query(`SELECT DISTINCT \`class\` AS name, COALESCE(section,'') AS section FROM students WHERE school_id=? AND LOWER(status)='active' AND COALESCE(archived,0)=0 ORDER BY \`class\`, section`, [sid])
    const [fromClasses] = await pool.query(`SELECT DISTINCT name, COALESCE(section,'') AS section FROM classes WHERE school_id=?`, [sid])
    const seen = new Set(), classes = []
    ;[...cls, ...fromClasses].forEach(c => { const k = c.name + '|' + c.section; if (c.name && !seen.has(k)) { seen.add(k); classes.push({ class: c.name, section: c.section }) } })
    classes.sort((a, b) => String(a.class).localeCompare(String(b.class), undefined, { numeric: true }) || a.section.localeCompare(b.section))
    const [teachers] = await pool.query(`SELECT id, name, subject FROM users WHERE school_id=? AND role IN ('teacher','staff') AND is_active=1 ORDER BY name`, [sid])
    const [subjects] = await pool.query(`SELECT DISTINCT name FROM subjects WHERE school_id=? ORDER BY name`, [sid])
    res.json({ classes, teachers, subjects: subjects.map(s => s.name) })
  } catch (e) { fail(res, e) }
}

/* GET /?class=&section= — one class's timetable */
exports.getClass = async (req, res) => {
  try {
    const { class: cls, section = '' } = req.query
    if (!cls) return res.status(400).json({ message: 'class is required' })
    const [rows] = await pool.query(
      `SELECT t.day_of_week, t.period_no, t.start_time, t.end_time, t.subject, t.teacher_id, t.room, u.name AS teacher_name
         FROM timetable t LEFT JOIN users u ON u.id=t.teacher_id
        WHERE t.school_id=? AND t.class_name=? AND t.section=? ORDER BY t.period_no, t.day_of_week`, [req.user.school_id, norm(cls), norm(section)])
    res.json(rows.map(r => ({ ...r, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) })))
  } catch (e) { fail(res, e) }
}

/* PUT /class — replace a whole class timetable.  body: { class, section, rows:[{day,period,start_time,end_time,subject,teacher_id,room}] } */
exports.saveClass = async (req, res) => {
  if (!canEdit(req, res)) return
  const sid = req.user.school_id, cls = norm(req.body.class), section = norm(req.body.section)
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  if (!cls) return res.status(400).json({ message: 'class is required' })
  if (rows.length > 120) return res.status(400).json({ message: 'Too many periods.' })
  const clean = []
  for (const r of rows) {
    const day = Number(r.day), period = Number(r.period), subject = norm(r.subject)
    if (!subject) continue                                                      // empty cell = free period
    if (!(day >= 1 && day <= 7) || !(period >= 1 && period <= 15)) return res.status(400).json({ message: 'Invalid day or period.' })
    const st = norm(r.start_time), en = norm(r.end_time)
    if ((st && !TIME.test(st)) || (en && !TIME.test(en))) return res.status(400).json({ message: 'Times must look like 09:30.' })
    clean.push({ day, period, subject: subject.slice(0, 100), start: st || null, end: en || null, teacher: r.teacher_id ? Number(r.teacher_id) : null, room: norm(r.room).slice(0, 30) || null })
  }
  const conn = await pool.getConnection()
  try {
    const ids = [...new Set(clean.map(c => c.teacher).filter(Boolean))]
    if (ids.length) {
      const [ok] = await conn.query('SELECT id FROM users WHERE school_id=? AND id IN (?)', [sid, ids])
      if (ok.length !== ids.length) return res.status(400).json({ message: 'One of the teachers does not belong to this school.' })
      // a teacher cannot be in two classes in the same period
      for (const c of clean.filter(x => x.teacher)) {
        const [clash] = await conn.query(
          `SELECT t.class_name, t.section, u.name FROM timetable t JOIN users u ON u.id=t.teacher_id
            WHERE t.school_id=? AND t.teacher_id=? AND t.day_of_week=? AND t.period_no=? AND NOT (t.class_name=? AND t.section=?) LIMIT 1`, [sid, c.teacher, c.day, c.period, cls, section])
        if (clash.length) return res.status(409).json({ message: `${clash[0].name} already teaches ${clash[0].class_name}${clash[0].section ? '-' + clash[0].section : ''} in period ${c.period} on the same day.` })
      }
    }
    await conn.beginTransaction()
    await conn.query('DELETE FROM timetable WHERE school_id=? AND class_name=? AND section=?', [sid, cls, section])
    for (const c of clean) {
      await conn.query('INSERT INTO timetable (school_id,class_name,section,day_of_week,period_no,start_time,end_time,subject,teacher_id,room) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [sid, cls, section, c.day, c.period, c.start, c.end, c.subject, c.teacher, c.room])
    }
    await conn.commit()
    res.json({ message: `Timetable saved (${clean.length} periods).`, count: clean.length })
  } catch (e) { try { await conn.rollback() } catch {} ; fail(res, e) } finally { conn.release() }
}

/* DELETE /class?class=&section= */
exports.clearClass = async (req, res) => {
  if (!canEdit(req, res)) return
  try {
    const { class: cls, section = '' } = req.query
    if (!cls) return res.status(400).json({ message: 'class is required' })
    await pool.query('DELETE FROM timetable WHERE school_id=? AND class_name=? AND section=?', [req.user.school_id, norm(cls), norm(section)])
    res.json({ message: 'Timetable cleared.' })
  } catch (e) { fail(res, e) }
}

/* GET /me — the logged-in teacher's periods: { today_dow, today:[...], week:{1:[...],...} } */
exports.mine = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT day_of_week, period_no, start_time, end_time, subject, class_name, section, room FROM timetable
        WHERE school_id=? AND teacher_id=? ORDER BY day_of_week, period_no`, [req.user.school_id, req.user.id])
    const week = {}
    rows.forEach(r => { (week[r.day_of_week] = week[r.day_of_week] || []).push({ period: r.period_no, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time), subject: r.subject, class: r.class_name, section: r.section, room: r.room }) })
    const dow = istDow()
    res.json({ today_dow: dow, today: week[dow] || [], week })
  } catch (e) { fail(res, e) }
}