// ═══════════════════════════════════════════════════════════════
// rolesController.js — Staff & Teacher onboarding (full version)
// MySQL (mysql2/promise pool). Place in src/controllers/
// Requires: npm i multer   (for document uploads)
// ═══════════════════════════════════════════════════════════════
const bcrypt = require('bcryptjs')
const { pool } = require('../db/pool')

// Every column an admin can set through onboarding
const FIELDS = [
  'name','email','phone','role','photo_url','gender','dob','date_of_joining',
  'employment_type','department','designation','reporting_to','qualification',
  'experience_years','previous_school','address','emergency_contact_name',
  'emergency_contact_phone','blood_group','aadhaar_number','pan_number',
  'police_verification','bank_account','bank_ifsc','pf_uan','esi_number',
  'class_teacher_of',
]

const nn = (v) => (v === '' || v === undefined ? null : v)

// ── Auto employee ID: TCH-001 for teachers, EMP-001 for others ──
async function generateEmployeeId(role) {
  const prefix = role === 'teacher' ? 'TCH' : 'EMP'
  const [rows] = await pool.execute(
    `SELECT employee_id FROM users WHERE employee_id LIKE ? ORDER BY employee_id DESC LIMIT 1`,
    [`${prefix}-%`]
  )
  const last = rows.length ? parseInt(rows[0].employee_id.split('-')[1], 10) : 0
  return `${prefix}-${String(last + 1).padStart(3, '0')}`
}

async function saveAssignments(userId, assignments) {
  await pool.execute('DELETE FROM teacher_assignments WHERE user_id = ?', [userId])
  for (const a of assignments || []) {
    if (!a.class || !a.section || !a.subject) continue
    await pool.execute(
      `INSERT IGNORE INTO teacher_assignments (user_id, class, section, subject) VALUES (?,?,?,?)`,
      [userId, a.class, a.section, a.subject]
    )
  }
}

// ── GET /api/roles/users — list with assignment summary ─────────
exports.listUsers = async (req, res, next) => {
  try {
    const [users] = await pool.execute(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.employee_id, u.designation,
             u.department, u.date_of_joining, u.employment_type, u.is_active,
             u.must_change_password, u.photo_url, u.class_teacher_of,
             GROUP_CONCAT(DISTINCT CONCAT(ta.class,'-',ta.section,' ',ta.subject) SEPARATOR ', ') AS assignments_summary
      FROM users u
      LEFT JOIN teacher_assignments ta ON ta.user_id = u.id
      WHERE u.school_id = ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `, [req.user.school_id])
    res.json(users)
  } catch (err) { next(err) }
}

// ── GET /api/roles/users/:id — full profile ─────────────────────
exports.getUser = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, school_id, name, email, phone, role, employee_id, photo_url, gender, dob,
              date_of_joining, employment_type, department, designation, reporting_to,
              qualification, experience_years, previous_school, address,
              emergency_contact_name, emergency_contact_phone, blood_group,
              aadhaar_number, pan_number, police_verification, bank_account, bank_ifsc,
              pf_uan, esi_number, is_active, must_change_password, class_teacher_of, created_at
       FROM users WHERE id = ? AND school_id = ?`,
      [req.params.id, req.user.school_id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Staff member not found' })

    const [assignments] = await pool.execute(
      'SELECT id, class, section, subject FROM teacher_assignments WHERE user_id = ?', [req.params.id])
    const [documents] = await pool.execute(
      'SELECT id, doc_type, file_path, original_name, status, uploaded_at FROM staff_documents WHERE user_id = ? ORDER BY uploaded_at DESC',
      [req.params.id])

    res.json({ ...rows[0], assignments, documents })
  } catch (err) { next(err) }
}

// ── POST /api/roles/users — create staff member ─────────────────
exports.createUser = async (req, res, next) => {
  try {
    const b = req.body
    if (!b.name || !b.email || !b.password || !b.role)
      return res.status(400).json({ message: 'Name, email, role and password are required' })
    if (b.password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const [dupe] = await pool.execute('SELECT id FROM users WHERE email = ?', [b.email])
    if (dupe.length) return res.status(400).json({ message: 'A user with this email already exists' })

    const employee_id = b.employee_id?.trim() || await generateEmployeeId(b.role)
    const hash = await bcrypt.hash(b.password, 10)

    const cols = ['school_id', 'employee_id', 'password_hash', 'must_change_password', ...FIELDS]
    const vals = [req.user.school_id, employee_id, hash, b.must_change_password === false ? 0 : 1,
                  ...FIELDS.map(f => nn(b[f]))]
    // employee_id already placed explicitly; remove duplicate from FIELDS-driven part? it's not in FIELDS. ok.
    const [result] = await pool.execute(
      `INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals)

    if (b.role === 'teacher') await saveAssignments(result.insertId, b.assignments)

    res.status(201).json({ id: result.insertId, employee_id, message: `${b.name} onboarded successfully` })
  } catch (err) { next(err) }
}

// ── PUT /api/roles/users/:id — update ───────────────────────────
exports.updateUser = async (req, res, next) => {
  try {
    const b = req.body
    const sets = [], vals = []
    for (const f of FIELDS) if (f in b) { sets.push(`${f} = ?`), vals.push(nn(b[f])) }
    if ('is_active' in b)            { sets.push('is_active = ?');            vals.push(b.is_active ? 1 : 0) }
    if ('must_change_password' in b) { sets.push('must_change_password = ?'); vals.push(b.must_change_password ? 1 : 0) }
    if (b.password) {
      if (b.password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })
      sets.push('password_hash = ?'); vals.push(await bcrypt.hash(b.password, 10))
    }
    if (sets.length) {
      vals.push(req.params.id, req.user.school_id)
      await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, vals)
    }
    if ('assignments' in b) await saveAssignments(req.params.id, b.assignments)
    res.json({ message: 'Staff member updated' })
  } catch (err) { next(err) }
}

// ── DELETE /api/roles/users/:id ─────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id)
      return res.status(400).json({ message: "You can't delete your own account" })
    await pool.execute('DELETE FROM users WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id])
    res.json({ message: 'Staff member deleted' })
  } catch (err) { next(err) }
}

// ── POST /api/roles/users/:id/reset-password ────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    const hash = await bcrypt.hash(new_password, 10)
    await pool.execute(
      'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ? AND school_id = ?',
      [hash, req.params.id, req.user.school_id])
    res.json({ message: 'Password reset — user must change it on next login' })
  } catch (err) { next(err) }
}

// ── Documents ────────────────────────────────────────────────────
// POST /api/roles/users/:id/documents  (multipart: file, doc_type)
exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
    const doc_type = req.body.doc_type || 'Other'
    await pool.execute(
      `INSERT INTO staff_documents (user_id, doc_type, file_path, original_name) VALUES (?,?,?,?)`,
      [req.params.id, doc_type, `/uploads/staff-docs/${req.file.filename}`, req.file.originalname])
    res.status(201).json({ message: `${doc_type} uploaded` })
  } catch (err) { next(err) }
}

// PUT /api/roles/documents/:docId/verify
exports.verifyDocument = async (req, res, next) => {
  try {
    await pool.execute(`UPDATE staff_documents SET status = 'Verified' WHERE id = ?`, [req.params.docId])
    res.json({ message: 'Document verified' })
  } catch (err) { next(err) }
}

// DELETE /api/roles/documents/:docId
exports.deleteDocument = async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM staff_documents WHERE id = ?', [req.params.docId])
    res.json({ message: 'Document removed' })
  } catch (err) { next(err) }
}