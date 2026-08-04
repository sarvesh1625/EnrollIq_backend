const { pool } = require('../db/pool')

async function getStudents(req, res, next) {
  try {
    const { class: cls, status, search, limit = 100, offset = 0 } = req.query
    const schoolId = req.user.school_id
    let where = 'school_id = ?', params = [schoolId]

    if (cls && cls !== 'All')       { where += ' AND class = ?';  params.push(cls) }
    if (status && status !== 'All') { where += ' AND status = ?'; params.push(status) }
    if (search) {
      where += ' AND (name LIKE ? OR roll_number LIKE ? OR parent_name LIKE ? OR parent_phone LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    const [students] = await pool.execute(
      `SELECT * FROM students WHERE ${where} ORDER BY class, name LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM students WHERE ${where}`, params)
    res.json({ students, total: count[0].total })
  } catch (err) { next(err) }
}

async function getStudentStats(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[tot]] = await pool.execute(`SELECT COUNT(*) AS c FROM students WHERE school_id=?`, [schoolId])
    const [[act]] = await pool.execute(`SELECT COUNT(*) AS c FROM students WHERE school_id=? AND status='Active'`, [schoolId])
    const [[nw]]  = await pool.execute(`SELECT COUNT(*) AS c FROM students WHERE school_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`, [schoolId])
    const [byClass] = await pool.execute(`SELECT class, COUNT(*) AS count FROM students WHERE school_id=? AND status='Active' GROUP BY class ORDER BY class`, [schoolId])
    res.json({ total: tot.c, active: act.c, new_this_month: nw.c, by_class: byClass })
  } catch (err) { next(err) }
}

async function getStudent(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM students WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id])
    if (!rows.length) return res.status(404).json({ message: 'Student not found' })
    const [fees] = await pool.execute('SELECT * FROM payments WHERE student_id = ? ORDER BY due_date DESC', [req.params.id])
    res.json({ ...rows[0], payments: fees })
  } catch (err) { next(err) }
}

async function createStudent(req, res, next) {
  try {
    const { name, roll_number, class: cls, section, dob, parent_name, parent_phone, parent_email, area } = req.body
    const schoolId = req.user.school_id
    if (!name || !cls) return res.status(400).json({ message: 'name and class are required' })

    let roll = roll_number
    if (!roll) {
      const [[cnt]] = await pool.execute('SELECT COUNT(*) AS c FROM students WHERE school_id = ?', [schoolId])
      roll = `S-${String(cnt.c + 1).padStart(3, '0')}`
    }

    const [result] = await pool.execute(
      `INSERT INTO students (school_id, name, roll_number, class, section, dob, parent_name, parent_phone, parent_email, area)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, name, roll, cls, section, dob||null, parent_name, parent_phone, parent_email, area]
    )
    const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function updateStudent(req, res, next) {
  try {
    const { name, roll_number, class: cls, section, dob, parent_name, parent_phone, parent_email, area, status } = req.body
    const [result] = await pool.execute(
      `UPDATE students SET
        name         = COALESCE(?, name),
        roll_number  = COALESCE(?, roll_number),
        class        = COALESCE(?, class),
        section      = COALESCE(?, section),
        dob          = COALESCE(?, dob),
        parent_name  = COALESCE(?, parent_name),
        parent_phone = COALESCE(?, parent_phone),
        parent_email = COALESCE(?, parent_email),
        area         = COALESCE(?, area),
        status       = COALESCE(?, status)
       WHERE id = ? AND school_id = ?`,
      [name, roll_number, cls, section, dob, parent_name, parent_phone, parent_email, area, status, req.params.id, req.user.school_id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Student not found' })
    const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function deleteStudent(req, res, next) {
  try {
    const [result] = await pool.execute('DELETE FROM students WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Student not found' })
    res.json({ message: 'Deleted', id: parseInt(req.params.id) })
  } catch (err) { next(err) }
}

module.exports = { getStudents, getStudentStats, getStudent, createStudent, updateStudent, deleteStudent }