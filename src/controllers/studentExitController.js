/**
 * EnrollIQ — Student Exit / Lifecycle controller (Phase 1)
 * Save as:  src/controllers/studentExitController.js
 *
 * Handles the guided exit workflow: clearance checklist + finalizing an exit
 * (archiving the student and setting a final status).
 */
const { pool } = require('../db/pool')

const EXIT_TYPES = ['Dropout', 'Withdrawn', 'School Transfer', 'Branch Transfer', 'Graduated', 'Expelled']

// GET /api/students/:id/exit  → current clearance state (creates a blank row if none)
async function getExitClearance(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const studentId = req.params.id
    // verify student belongs to this school
    const [[stu]] = await pool.query('SELECT * FROM students WHERE id=? AND school_id=?', [studentId, schoolId])
    if (!stu) return res.status(404).json({ message: 'Student not found' })

    let [[row]] = await pool.query('SELECT * FROM student_exit_clearance WHERE student_id=?', [studentId])
    if (!row) {
      await pool.execute('INSERT INTO student_exit_clearance (student_id, school_id) VALUES (?, ?)', [studentId, schoolId])
      ;[[row]] = await pool.query('SELECT * FROM student_exit_clearance WHERE student_id=?', [studentId])
    }
    res.json({ student: stu, clearance: row, exitTypes: EXIT_TYPES })
  } catch (err) { next(err) }
}

// PUT /api/students/:id/exit  → save the clearance checklist (partial saves allowed)
async function saveExitClearance(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const studentId = req.params.id
    const [[stu]] = await pool.query('SELECT id FROM students WHERE id=? AND school_id=?', [studentId, schoolId])
    if (!stu) return res.status(404).json({ message: 'Student not found' })

    const f = req.body || {}
    // ensure a row exists
    const [[exists]] = await pool.query('SELECT id FROM student_exit_clearance WHERE student_id=?', [studentId])
    if (!exists) await pool.execute('INSERT INTO student_exit_clearance (student_id, school_id) VALUES (?, ?)', [studentId, schoolId])

    await pool.execute(
      `UPDATE student_exit_clearance SET
        fees_cleared=?, fees_note=?,
        library_cleared=?, library_note=?,
        transport_cleared=?, transport_note=?,
        books_returned=?, books_note=?,
        principal_approved=?, principal_note=?
       WHERE student_id=?`,
      [
        f.fees_cleared?1:0, f.fees_note||null,
        f.library_cleared?1:0, f.library_note||null,
        f.transport_cleared?1:0, f.transport_note||null,
        f.books_returned?1:0, f.books_note||null,
        f.principal_approved?1:0, f.principal_note||null,
        studentId,
      ])
    const [[row]] = await pool.query('SELECT * FROM student_exit_clearance WHERE student_id=?', [studentId])
    res.json(row)
  } catch (err) { next(err) }
}

// POST /api/students/:id/exit/finalize  → archive + set final status
async function finalizeExit(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const studentId = req.params.id
    const { exit_type, exit_reason, exit_date, exit_notes, transfer_to } = req.body

    if (!EXIT_TYPES.includes(exit_type))
      return res.status(400).json({ message: 'Invalid exit type' })

    const [[stu]] = await pool.query('SELECT * FROM students WHERE id=? AND school_id=?', [studentId, schoolId])
    if (!stu) return res.status(404).json({ message: 'Student not found' })

    // require principal approval before finalizing
    const [[cl]] = await pool.query('SELECT * FROM student_exit_clearance WHERE student_id=?', [studentId])
    if (!cl || !cl.principal_approved)
      return res.status(400).json({ message: 'Principal approval is required before finalizing the exit' })

    // final status label: Graduated -> 'Graduated', transfers -> the type, else the type
    const finalStatus = exit_type

    await pool.execute(
      `UPDATE students SET
         status=?, exit_type=?, exit_reason=?, exit_date=?, exit_notes=?, transfer_to=?,
         archived=1, archived_at=NOW()
       WHERE id=? AND school_id=?`,
      [finalStatus, exit_type, exit_reason||null, exit_date||null, exit_notes||null, transfer_to||null, studentId, schoolId])

    const [[updated]] = await pool.query('SELECT * FROM students WHERE id=?', [studentId])
    res.json({ success: true, student: updated })
  } catch (err) { next(err) }
}

// POST /api/students/:id/reactivate  → undo an exit (bring back to Active)
async function reactivateStudent(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const studentId = req.params.id
    await pool.execute(
      `UPDATE students SET status='Active', archived=0, archived_at=NULL,
         exit_type=NULL, exit_reason=NULL, exit_date=NULL, exit_notes=NULL, transfer_to=NULL
       WHERE id=? AND school_id=?`, [studentId, schoolId])
    const [[updated]] = await pool.query('SELECT * FROM students WHERE id=?', [studentId])
    res.json({ success: true, student: updated })
  } catch (err) { next(err) }
}

module.exports = { getExitClearance, saveExitClearance, finalizeExit, reactivateStudent, EXIT_TYPES }