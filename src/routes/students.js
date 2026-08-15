const router = require('express').Router()
const { protect } = require('../middleware/auth')
const {
  getStudents, getStudentStats, getStudent,
  createStudent, updateStudent, deleteStudent
} = require('../controllers/studentsController')
const {
  getExitClearance, saveExitClearance, finalizeExit, reactivateStudent
} = require('../controllers/studentExitController')

router.use(protect)
router.get('/stats', getStudentStats)
router.get('/',      getStudents)
router.get('/:id',   getStudent)
router.post('/',     createStudent)
router.put('/:id',   updateStudent)
router.delete('/:id',deleteStudent)

// ── Student exit / lifecycle (Phase 1) ──
router.get('/:id/exit',           getExitClearance)
router.put('/:id/exit',           saveExitClearance)
router.post('/:id/exit/finalize', finalizeExit)
router.post('/:id/reactivate',    reactivateStudent)

module.exports = router