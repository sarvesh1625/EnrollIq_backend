const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { pool } = require('../db/pool')
const {
  getAdmissions, getAdmissionStats, getAdmission,
  createAdmission, updateAdmission, deleteAdmission
} = require('../controllers/admissionsController')

router.use(protect)
router.get('/stats', getAdmissionStats)
router.get('/',      getAdmissions)
router.get('/:id',   getAdmission)
router.post('/',     createAdmission)
router.put('/:id',   updateAdmission)
router.delete('/:id',deleteAdmission)
module.exports = router

// POST /api/admissions/:id/convert-to-student
router.post('/:id/convert-to-student', protect, async (req, res, next) => {
  try {
    const { class: cls, section, roll_number, dob, parent_email } = req.body
    const schoolId = req.user.school_id

    // Get admission
    const [admissions] = await pool.execute(
      'SELECT * FROM admissions WHERE id=? AND school_id=?',
      [req.params.id, schoolId]
    )
    if (!admissions.length) return res.status(404).json({ message: 'Admission not found' })
    const adm = admissions[0]

    // Check not already converted
    if (adm.student_id) return res.status(400).json({ message: 'Already converted to student' })

    // Auto-generate roll number if not provided
    let roll = roll_number
    if (!roll) {
      const [[last]] = await pool.execute(
        `SELECT roll_number FROM students WHERE school_id=? AND class=? ORDER BY created_at DESC LIMIT 1`,
        [schoolId, cls]
      )
      if (last?.roll_number) {
        const num = parseInt(last.roll_number.replace(/\D/g,'')) || 0
        roll = `S-${String(num + 1).padStart(3,'0')}`
      } else {
        roll = 'S-001'
      }
    }

    // Create student record
    const [result] = await pool.execute(
      `INSERT INTO students
        (school_id, name, class, section, roll_number, dob, parent_name, parent_phone, parent_email, status)
       VALUES (?,?,?,?,?,?,?,?,?,'Active')`,
      [schoolId, adm.student_name, cls, section||'A', roll,
       dob||null, adm.parent_name, adm.parent_phone, parent_email||adm.parent_email||null]
    )
    const studentId = result.insertId

    // Update admission — link student + set status Admitted
    await pool.execute(
      `UPDATE admissions SET student_id=?, status='Admitted' WHERE id=?`,
      [studentId, req.params.id]
    )

    const [students] = await pool.execute('SELECT * FROM students WHERE id=?', [studentId])

    res.status(201).json({
      success: true,
      message: `${adm.student_name} enrolled as student successfully!`,
      student: students[0],
    })
  } catch (err) { next(err) }
})