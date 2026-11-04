/**
 * Save as: backend/src/routes/teacher.js
 * Mount in server.js:  app.use('/api/teacher', require('./routes/teacher'))
 */
const router = require('express').Router()
const { protect } = require('../middleware/auth')
const ctrl = require('../controllers/teacherController')

router.use(protect)
router.get ('/classes',   ctrl.myClasses)
router.get ('/students',  ctrl.classStudents)
router.get ('/checklist', ctrl.checklist)
router.get ('/messages',  ctrl.sentMessages)
router.post('/messages',  ctrl.sendParentMessage)

module.exports = router