const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { getAttendance, markBulk, getStudentAttendance, getSummary } = require('../controllers/attendanceController')
router.use(protect)
router.get('/summary',         getSummary)
router.get('/',                getAttendance)
router.post('/mark-bulk',      markBulk)
router.get('/student/:id',     getStudentAttendance)
module.exports = router