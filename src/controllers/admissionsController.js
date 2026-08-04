const { pool } = require('../db/pool')

async function getAdmissions(req, res, next) {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query
    const schoolId = req.user.school_id
    let where = 'a.school_id = ?', params = [schoolId]

    if (status && status !== 'All') { where += ' AND a.status = ?'; params.push(status) }
    if (search) {
      where += ' AND (a.student_name LIKE ? OR a.parent_name LIKE ? OR a.parent_phone LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const [admissions] = await pool.execute(
      `SELECT a.*, l.ai_score, l.ai_label, l.lead_source FROM admissions a
       LEFT JOIN leads l ON l.id = a.lead_id
       WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM admissions a WHERE ${where}`, params)
    res.json({ admissions, total: count[0].total })
  } catch (err) { next(err) }
}

async function getAdmissionStats(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const month    = new Date().toISOString().slice(0, 7)

    const [[tot]] = await pool.execute(`SELECT COUNT(*) AS c FROM admissions WHERE school_id=?`, [schoolId])
    const [[pen]] = await pool.execute(`SELECT COUNT(*) AS c FROM admissions WHERE school_id=? AND status IN ('New','Under Review','Interview Scheduled')`, [schoolId])
    const [[adm]] = await pool.execute(`SELECT COUNT(*) AS c FROM admissions WHERE school_id=? AND status='Admitted'`, [schoolId])
    const [[mon]] = await pool.execute(`SELECT COUNT(*) AS c FROM admissions WHERE school_id=? AND DATE_FORMAT(created_at,'%Y-%m')=?`, [schoolId, month])
    const [[lea]] = await pool.execute(`SELECT COUNT(*) AS c FROM leads WHERE school_id=?`, [schoolId])

    const totalLeads = lea.c
    res.json({
      total_applications: tot.c, pending_review: pen.c,
      admitted_this_year: adm.c, this_month: mon.c,
      conversion_rate: totalLeads > 0 ? Math.round((adm.c / totalLeads) * 100) : 0,
    })
  } catch (err) { next(err) }
}

async function getAdmission(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, l.phone AS parent_phone_lead, l.lead_source, l.ai_score, l.ai_label, l.keyword
       FROM admissions a LEFT JOIN leads l ON l.id = a.lead_id
       WHERE a.id = ? AND a.school_id = ?`,
      [req.params.id, req.user.school_id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Admission not found' })
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function createAdmission(req, res, next) {
  try {
    const { lead_id, student_name, date_of_birth, grade_applied, parent_name, parent_phone, parent_email, notes } = req.body
    const schoolId = req.user.school_id
    if (!student_name || !grade_applied) return res.status(400).json({ message: 'student_name and grade_applied are required' })

    const [result] = await pool.execute(
      `INSERT INTO admissions (school_id, lead_id, student_name, date_of_birth, grade_applied, parent_name, parent_phone, parent_email, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, lead_id||null, student_name, date_of_birth||null, grade_applied, parent_name, parent_phone, parent_email, notes]
    )
    if (lead_id) await pool.execute(`UPDATE leads SET status='Admission' WHERE id=? AND school_id=?`, [lead_id, schoolId])
    const [rows] = await pool.execute('SELECT * FROM admissions WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

async function updateAdmission(req, res, next) {
  try {
    const { student_name, date_of_birth, grade_applied, parent_name, parent_phone, parent_email, docs_complete, status, admission_date, notes } = req.body

    const [result] = await pool.execute(
      `UPDATE admissions SET
        student_name   = COALESCE(?, student_name),
        date_of_birth  = COALESCE(?, date_of_birth),
        grade_applied  = COALESCE(?, grade_applied),
        parent_name    = COALESCE(?, parent_name),
        parent_phone   = COALESCE(?, parent_phone),
        parent_email   = COALESCE(?, parent_email),
        docs_complete  = COALESCE(?, docs_complete),
        status         = COALESCE(?, status),
        admission_date = COALESCE(?, admission_date),
        notes          = COALESCE(?, notes)
       WHERE id = ? AND school_id = ?`,
      [student_name||null, date_of_birth||null, grade_applied||null, parent_name||null,
       parent_phone||null, parent_email||null,
       docs_complete != null ? (docs_complete ? 1 : 0) : null,
       status||null, admission_date||null, notes||null, req.params.id, req.user.school_id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Admission not found' })

    if (status === 'Admitted') {
      const [adm] = await pool.execute('SELECT * FROM admissions WHERE id = ?', [req.params.id])
      const a     = adm[0]
      const [ex]  = await pool.execute('SELECT id FROM students WHERE admission_id = ?', [a.id])
      if (!ex.length) {
        await pool.execute(
          `INSERT INTO students (school_id, admission_id, name, class, dob, parent_name, parent_phone, parent_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [a.school_id, a.id, a.student_name, a.grade_applied, a.date_of_birth, a.parent_name, a.parent_phone, a.parent_email]
        )
      }
    }

    const [rows] = await pool.execute('SELECT * FROM admissions WHERE id = ?', [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function deleteAdmission(req, res, next) {
  try {
    const [result] = await pool.execute('DELETE FROM admissions WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Admission not found' })
    res.json({ message: 'Deleted', id: parseInt(req.params.id) })
  } catch (err) { next(err) }
}

module.exports = { getAdmissions, getAdmissionStats, getAdmission, createAdmission, updateAdmission, deleteAdmission }
