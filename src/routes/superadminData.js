/**
 * EnrollIQ — Super Admin only: bulk IMPORT and EXPORT of a school's data
 * Save as:  backend/src/routes/superadminData.js
 * Mount in server.js ABOVE the existing /api/superadmin line:
 *     app.use('/api/superadmin/data', require('./routes/superadminData'))
 *
 *   POST /import/students   { school_id, rows:[...] }      (send big files in chunks of ~1000 rows)
 *   POST /import/leads      { school_id, rows:[...] }
 *   GET  /history?school_id=
 *   GET  /export/students|leads|fees|attendance?school_id=&from=&to=     → CSV download
 * School admins, chairmen and every other role get 401/403 here — a school login can never reach it.
 */
const router = require('express').Router()
const jwt = require('jsonwebtoken')
const { pool } = require('../db/pool')
const { importLeads } = require('../controllers/importController')

const MAX_ROWS_PER_REQUEST = 5000
const PAGE = 5000

function superAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'superadmin') return res.status(403).json({ message: 'Import and export are available to the platform Super Admin only.' })
    req.superAdmin = decoded
    next()
  } catch { res.status(401).json({ message: 'Session expired. Please login again.' }) }
}
router.use(superAuth)
router.use('/pack', require('./superadminPack'))      // full school pack upload (uses the same Super Admin check)

async function targetSchool(req, res, next) {
  try {
    const id = Number(req.body?.school_id ?? req.query.school_id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Choose a school first.' })
    const [[s]] = await pool.query('SELECT id, name FROM schools WHERE id=?', [id])
    if (!s) return res.status(404).json({ message: 'School not found.' })
    req.school = s
    next()
  } catch (e) { next(e) }
}

/* ───────── import ───────── */
function guardRows(req, res, next) {
  const rows = req.body?.rows
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ message: 'rows array is required' })
  if (rows.length > MAX_ROWS_PER_REQUEST) return res.status(413).json({ message: `Send at most ${MAX_ROWS_PER_REQUEST} rows per request.` })
  next()
}
// The existing import logic works on req.user.school_id — hand it the chosen school.
// It also adds the reason each failed row was rejected (the old controller only logs them in bulk_imports.errors).
// The old leads controller logs a whole JSON row for a rejected line — show something a person can act on.
function tidyError(e) {
  const m = e.match(/^Row missing parent_name or phone: (\{.*\})$/)
  if (!m) return e
  try { const r = JSON.parse(m[1]); return `Skipped: parent name and phone are both required (got name "${r.parent_name || ''}", phone "${r.phone || ''}")` } catch { return 'Skipped: parent name and phone are both required' }
}
const asSchool = (fn) => (req, res, next) => {
  req.user = { id: null, school_id: req.school.id, role: 'superadmin' }
  const json = res.json.bind(res)
  res.json = async (body) => {
    try {
      if (body && body.success !== undefined) {
        const [[b]] = await pool.query('SELECT errors FROM bulk_imports WHERE school_id=? ORDER BY id DESC LIMIT 1', [req.school.id])
        body.errors = b?.errors ? String(b.errors).split('\n').map(tidyError) : []
      }
    } catch { /* the import itself already succeeded */ }
    return json(body)
  }
  return fn(req, res, next)
}

/* Students: written here (not the old controller) so a re-upload never creates duplicates — a student is matched by
   roll / admission number inside the chosen school: found → updated, not found → added. */
function parseDob(v) {
  v = String(v ?? '').trim()
  if (!v) return null
  let y, m, d, x
  if ((x = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3] }
  else if ((x = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) { d = +x[1]; m = +x[2]; y = +x[3] }   // Indian day-first dates
  else return undefined
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return undefined
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const clip = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null }

async function importStudentsSafe(req, res, next) {
  try {
    const sid = req.school.id, rows = req.body.rows, offset = Number(req.body.offset) || 0
    const [log] = await pool.query(`INSERT INTO bulk_imports (school_id, import_type, total_rows, status, imported_by) VALUES (?,?,?,'Processing',NULL)`, [sid, 'students', rows.length])

    const errors = [], clean = [], seen = new Set()
    rows.forEach((r, i) => {
      const n = offset + i + 1
      const name = clip(r.name, 150)
      if (!name) { errors.push(`Row ${n}: name is required`); return }
      const dob = parseDob(r.dob)
      if (dob === undefined) { errors.push(`Row ${n}: date of birth "${r.dob}" is not a valid date (use 2016-03-12 or 12-03-2016)`); return }
      const roll = clip(r.roll_number, 20)                              // null → resolved below
      if (roll) {
        if (seen.has(roll)) { errors.push(`Row ${n}: roll number ${roll} appears twice in the file`); return }
        seen.add(roll)
      }
      let cls = clip(r.class ?? r.grade, 20); if (cls && /^\d{1,2}$/.test(cls)) cls = 'Grade ' + cls
      clean.push({ roll, name, cls, section: clip(r.section, 10), dob, parent_name: clip(r.parent_name, 150),
                   phone: clip(r.phone ?? r.parent_phone, 20), email: clip(r.email ?? r.parent_email, 150), area: clip(r.area, 100) })
    })

    // Rows without a roll number: if the school already has the same name + class + section + date of birth, treat it as
    // that student (so re-uploading a file that has no roll column does not duplicate everyone); otherwise give a new S-number.
    const blank = clean.filter(c => !c.roll)
    if (blank.length) {
      const [mx] = await pool.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(roll_number,3) AS UNSIGNED)),0) m FROM students WHERE school_id=? AND roll_number REGEXP '^S-[0-9]+$'`, [sid])
      let nextRoll = Number(mx[0].m) || 0
      const [cand] = await pool.query(`SELECT roll_number, name, class, section, DATE_FORMAT(dob,'%Y-%m-%d') dob FROM students WHERE school_id=? AND roll_number IS NOT NULL AND name IN (?)`, [sid, [...new Set(blank.map(c => c.name))]])
      const key = (name, cls, sec, dob) => [name, cls || '', sec || '', dob || ''].join('\u0001').toLowerCase()
      const pool_ = new Map()
      cand.forEach(x => { const k = key(x.name, x.class, x.section, x.dob); (pool_.get(k) || pool_.set(k, []).get(k)).push(x.roll_number) })
      for (const c of blank) {
        const list = pool_.get(key(c.name, c.cls, c.section, c.dob))
        let r2 = null
        while (list && list.length && !r2) { const t = list.shift(); if (!seen.has(t)) r2 = t }
        if (!r2) { do { r2 = `S-${String(++nextRoll).padStart(3, '0')}` } while (seen.has(r2)) }
        c.roll = r2; seen.add(r2)
      }
    }

    let created = 0, updated = 0
    if (clean.length) {
      const [ex] = await pool.query('SELECT id, roll_number FROM students WHERE school_id=? AND roll_number IN (?)', [sid, clean.map(c => c.roll)])
      const have = new Map(ex.map(x => [x.roll_number, x.id]))
      const fresh = clean.filter(c => !have.has(c.roll)), old = clean.filter(c => have.has(c.roll))
      for (let i = 0; i < fresh.length; i += 500) {
        const part = fresh.slice(i, i + 500)
        await pool.query('INSERT INTO students (school_id, roll_number, name, class, section, dob, parent_name, parent_phone, parent_email, area) VALUES ?',
          [part.map(c => [sid, c.roll, c.name, c.cls, c.section, c.dob, c.parent_name, c.phone, c.email, c.area])])
      }
      created = fresh.length
      for (const c of old) {                                              // only overwrite what the file actually provides
        await pool.query(`UPDATE students SET name=?, class=COALESCE(?,class), section=COALESCE(?,section), dob=COALESCE(?,dob), parent_name=COALESCE(?,parent_name),
                          parent_phone=COALESCE(?,parent_phone), parent_email=COALESCE(?,parent_email), area=COALESCE(?,area) WHERE id=?`,
          [c.name, c.cls, c.section, c.dob, c.parent_name, c.phone, c.email, c.area, have.get(c.roll)])
        updated++
      }
      // like "Add student": give each one an enrollment in the active academic year (skipped quietly if the table differs)
      try {
        const [[ay]] = await pool.query('SELECT id FROM academic_years WHERE is_active=1 LIMIT 1')
        if (ay) {
          const [ids] = await pool.query('SELECT id, roll_number FROM students WHERE school_id=? AND roll_number IN (?)', [sid, clean.map(c => c.roll)])
          const idOf = new Map(ids.map(x => [x.roll_number, x.id]))
          const enr = clean.filter(c => c.cls && idOf.has(c.roll)).map(c => [idOf.get(c.roll), ay.id, c.cls, c.section, c.roll, 'Active'])
          for (let i = 0; i < enr.length; i += 500)
            await pool.query('INSERT IGNORE INTO student_enrollments (student_id, academic_year_id, class, section, roll_number, status) VALUES ?', [enr.slice(i, i + 500)])
        }
      } catch { /* not fatal */ }
    }

    await pool.query(`UPDATE bulk_imports SET success_rows=?, failed_rows=?, status='Completed', errors=? WHERE id=?`,
      [created + updated, errors.length, errors.slice(0, 10).join('\n') || null, log.insertId])
    res.status(201).json({ message: `Import complete: ${created} added, ${updated} updated, ${errors.length} failed`,
                           success: created + updated, created, updated, failed: errors.length, errors: errors.slice(0, 10) })
  } catch (e) { next(e) }
}
router.post('/import/students', targetSchool, guardRows, importStudentsSafe)
router.post('/import/leads',    targetSchool, guardRows, asSchool(importLeads))

router.get('/history', targetSchool, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT bi.id, bi.import_type, bi.total_rows, bi.success_rows, bi.failed_rows, bi.status, bi.created_at,
              COALESCE(u.name, 'Super Admin') AS imported_by_name
       FROM bulk_imports bi LEFT JOIN users u ON u.id = bi.imported_by
       WHERE bi.school_id=? ORDER BY bi.created_at DESC LIMIT 30`, [req.school.id])
    res.json(rows)
  } catch (e) { next(e) }
})

/* ───────── export ───────── */
// Spreadsheet formula injection guard + RFC-4180 quoting
function cell(v) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const line = (arr) => arr.map(cell).join(',') + '\r\n'
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'school'
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s))

async function hasCol(table, col) {
  const [[r]] = await pool.query(`SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [table, col])
  return r.n > 0
}

const EXPORTS = {
  students: {
    headers: ['Roll / Admission No', 'Name', 'Class', 'Section', 'Date of Birth', 'Parent Name', 'Parent Phone', 'Parent Email', 'Area', 'Status', 'Admitted On'],
    sql: () => `SELECT roll_number, name, class, section, DATE_FORMAT(dob,'%Y-%m-%d') dob, parent_name, parent_phone, parent_email, area, status, DATE_FORMAT(created_at,'%Y-%m-%d') admitted
                FROM students WHERE school_id=? ORDER BY id LIMIT ? OFFSET ?`,
    params: (r) => [r.school.id],
  },
  leads: {
    headers: ['Parent Name', 'Phone', 'Email', 'Class Interested', 'Area', 'Source', 'Stage', 'AI Score', 'AI Label', 'Created On', 'Academic Year', 'Notes'],
    sql: (r) => `SELECT l.parent_name, l.phone, l.email, l.child_grade, l.area, l.lead_source, l.status, l.ai_score, l.ai_label,
                        DATE_FORMAT(l.created_at,'%Y-%m-%d') created, ${r.leadYear ? 'ay.name' : 'NULL'} ay, l.notes
                 FROM leads l ${r.leadYear ? 'LEFT JOIN academic_years ay ON ay.id = l.academic_year_id' : ''}
                 WHERE l.school_id=? ORDER BY l.id LIMIT ? OFFSET ?`,
    params: (r) => [r.school.id],
  },
  fees: {
    headers: ['Roll / Admission No', 'Student', 'Class', 'Fee', 'Amount', 'Paid', 'Due Date', 'Paid On', 'Mode', 'Status', 'Reference'],
    sql: () => `SELECT s.roll_number, s.name, s.class, p.fee_type, p.amount, p.paid_amount, DATE_FORMAT(p.due_date,'%Y-%m-%d') due,
                       DATE_FORMAT(p.paid_date,'%Y-%m-%d') paid_on, p.payment_mode, p.status, p.reference_no
                FROM payments p LEFT JOIN students s ON s.id = p.student_id
                WHERE p.school_id=? ORDER BY p.id LIMIT ? OFFSET ?`,
    params: (r) => [r.school.id],
  },
  attendance: {
    headers: ['Date', 'Roll / Admission No', 'Student', 'Class', 'Section', 'Status'],
    sql: () => `SELECT DATE_FORMAT(ca.date,'%Y-%m-%d') d, s.roll_number, s.name, COALESCE(ca.class_name, s.class) cls, s.section, ca.status
                FROM class_attendance ca JOIN students s ON s.id = ca.student_id
                WHERE ca.school_id=? AND ca.date BETWEEN ? AND ? ORDER BY ca.date, s.class, s.name LIMIT ? OFFSET ?`,
    params: (r) => [r.school.id, r.from, r.to],
  },
}

router.get('/export/:type', targetSchool, async (req, res, next) => {
  try {
    const spec = EXPORTS[req.params.type]
    if (!spec) return res.status(404).json({ message: 'Unknown export. Use students, leads, fees or attendance.' })
    if (req.params.type === 'attendance') {
      const t = todayIST()
      req.from = req.query.from || t.slice(0, 8) + '01'
      req.to = req.query.to || t
      if (!isYMD(req.from) || !isYMD(req.to)) return res.status(400).json({ message: 'Dates must look like 2026-04-30.' })
      if (req.from > req.to) return res.status(400).json({ message: '"From" must be on or before "To".' })
      if ((Date.parse(req.to) - Date.parse(req.from)) / 864e5 > 366) return res.status(400).json({ message: 'Choose a range of one year or less.' })
    }
    if (req.params.type === 'leads') req.leadYear = await hasCol('leads', 'academic_year_id')

    const name = `${slug(req.school.name)}_${req.params.type}${req.params.type === 'attendance' ? `_${req.from}_to_${req.to}` : ''}_${todayIST()}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.write('﻿' + line(spec.headers))                       // BOM so Excel reads Telugu / Hindi names correctly
    const base = spec.params(req)
    for (let offset = 0; ; offset += PAGE) {
      const [rows] = await pool.query(spec.sql(req), [...base, PAGE, offset])
      if (rows.length) res.write(rows.map(r => line(Object.values(r))).join(''))
      if (rows.length < PAGE) break
    }
    res.end()
  } catch (e) {
    if (res.headersSent) return res.end()                          // too late for a clean error; the download just stops
    next(e)
  }
})

module.exports = router