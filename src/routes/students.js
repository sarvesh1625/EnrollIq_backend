const router = require('express').Router()
const { protect } = require('../middleware/auth')
const {
  getStudents, getStudentStats, getStudent,
  createStudent, updateStudent, deleteStudent
} = require('../controllers/studentsController')

router.use(protect)
router.get('/stats', getStudentStats)
router.get('/',      getStudents)
router.get('/:id',   getStudent)
router.post('/',     createStudent)
router.put('/:id',   updateStudent)
router.delete('/:id',deleteStudent)
module.exports = router