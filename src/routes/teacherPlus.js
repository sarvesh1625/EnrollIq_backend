/**
 * EnrollIQ — Teacher app, Phase B (routes)
 * Save as:  backend/src/routes/teacherPlus.js
 * Mount in server.js (one line, next to the other app.use lines):
 *     app.use('/api/teacher-plus', require('./routes/teacherPlus'))
 */
const router = require('express').Router()
const { protect } = require('../middleware/auth')
const ctrl = require('../controllers/teacherPlusController')

router.use(protect)
router.get('/activity',              ctrl.activity)
router.get('/overview',              ctrl.overview)
router.get('/attendance/records',    ctrl.attendanceRecords)
router.get('/attendance/day',        ctrl.attendanceDay)
router.get('/attendance/summary',    ctrl.attendanceSummary)
router.get('/students/:id/profile',     ctrl.studentProfile)
router.get('/students/:id/report-card', ctrl.studentReportCard)
router.get('/notifications',         ctrl.notifications)

module.exports = router