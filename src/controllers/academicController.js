/**
 * EnrollIQ — Academic Year + Promotion controller
 * Save as: src/controllers/academicController.js
 *
 *  GET  /api/academic/years                 list years
 *  POST /api/academic/years                 create year
 *  PUT  /api/academic/years/:id/activate    make a year the active one
 *  GET  /api/academic/promotion/candidates  students of a class in a year
 *  POST /api/academic/promotion             run the promotion
 *  GET  /api/academic/students/:id/history  a student's year-by-year history
 */
const { pool } = require('../db/pool')

const LADDER = ['Pre-KG','LKG','UKG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
                'Grade 6','Grade 7','Grade 8','Grade 9','Grade 10']

const nextClass = (c) => {
  const i = LADDER.indexOf(c)
  if (i === -1) return null
  return i === LADDER.length - 1 ? 'Graduated' : LADDER[i + 1]
}

/* ─── YEARS ──────────────────────────────────────────────── */
exports.listYears = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT y.*,
             (SELECT COUNT(*) FROM student_enrollments e WHERE e.academic_year_id = y.id) AS students
      FROM academic_years y ORDER BY y.name DESC`)
    res.json(rows)
  } catch (e) { next(e) }
}

exports.createYear = async (req, res, next) => {
  try {
    const { name, start_date = null, end_date = null } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Year name is required' })
    const [r] = await pool.execute(
      `INSERT INTO academic_years (name, start_date, end_date) VALUES (?,?,?)`,
      [name.trim(), start_date, end_date])
    res.status(201).json({ id: r.insertId, message: `Academic year ${name} created` })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'That year already exists' })
    next(e)
  }
}

exports.activateYear = async (req, res, next) => {
  try {
    await pool.query(`UPDATE academic_years SET is_active = 0`)
    await pool.execute(`UPDATE academic_years SET is_active = 1 WHERE id = ?`, [req.params.id])
    const [[y]] = await pool.execute(`SELECT name FROM academic_years WHERE id = ?`, [req.params.id])
    res.json({ message: `${y?.name || 'Year'} is now the active academic year` })
  } catch (e) { next(e) }
}

/* ─── PROMOTION ──────────────────────────────────────────── */
// Students enrolled in a given class + year, with a suggested next class
exports.candidates = async (req, res, next) => {
  try {
    const { from_year, class: cls } = req.query
    if (!from_year) return res.status(400).json({ message: 'from_year is required' })
    const params = [from_year]
    let where = 'e.academic_year_id = ?'
    if (cls && cls !== 'All') { where += ' AND e.class = ?'; params.push(cls) }

    const [rows] = await pool.execute(`
      SELECT e.id AS enrollment_id, e.student_id, e.class, e.section, e.roll_number, e.status,
             s.name
      FROM student_enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE ${where}
        AND (s.archived = 0 OR s.archived IS NULL)
      ORDER BY e.class, e.section, s.name`, params)

    rows.forEach(r => { r.suggested_class = nextClass(r.class) })
    res.json(rows)
  } catch (e) { next(e) }
}

/**
 * Body: {
 *   from_year_id, to_year_id,
 *   students: [ { student_id, action, to_class, section, remarks } ]
 *      action = Promoted | Detained | Transferred | Graduated
 * }
 */
exports.promote = async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const { from_year_id, to_year_id, students = [] } = req.body
    if (!from_year_id || !to_year_id)
      return res.status(400).json({ message: 'from_year_id and to_year_id are required' })
    if (from_year_id === to_year_id)
      return res.status(400).json({ message: 'From and To year must be different' })
    if (!students.length)
      return res.status(400).json({ message: 'No students selected' })

    await conn.beginTransaction()
    const counts = { Promoted: 0, Detained: 0, Transferred: 0, Graduated: 0 }

    for (const s of students) {
      const action = s.action || 'Promoted'

      // 1) close out the old year's enrollment
      await conn.execute(
        `UPDATE student_enrollments
         SET status = ?, promoted_to = ?, remarks = ?
         WHERE student_id = ? AND academic_year_id = ?`,
        [action, s.to_class || null, s.remarks || null, s.student_id, from_year_id])

      // 2) leavers get no new enrollment
      if (action === 'Transferred' || action === 'Graduated') {
        counts[action]++
        continue
      }

      // 3) create the new year's enrollment (Detained keeps the same class)
      const newClass = action === 'Detained' ? (s.from_class || s.to_class) : s.to_class
      if (!newClass) continue

      await conn.execute(
        `INSERT INTO student_enrollments
           (student_id, academic_year_id, class, section, roll_number, status)
         VALUES (?,?,?,?,?, 'Active')
         ON DUPLICATE KEY UPDATE class = VALUES(class), section = VALUES(section), status = 'Active'`,
        [s.student_id, to_year_id, newClass, s.section || null, s.roll_number || null])

      // 4) keep students.class in sync so every existing page keeps working
      await conn.execute(`UPDATE students SET class = ? WHERE id = ?`, [newClass, s.student_id])
      counts[action]++
    }

    await conn.commit()
    const summary = Object.entries(counts).filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')
    res.json({ message: `Promotion complete — ${summary}`, counts })
  } catch (e) {
    await conn.rollback(); next(e)
  } finally { conn.release() }
}

/* ─── STUDENT HISTORY ────────────────────────────────────── */
exports.history = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT e.*, y.name AS year_name, y.start_date
      FROM student_enrollments e
      JOIN academic_years y ON y.id = e.academic_year_id
      WHERE e.student_id = ?
      ORDER BY y.name DESC`, [req.params.id])
    res.json(rows)
  } catch (e) { next(e) }
}