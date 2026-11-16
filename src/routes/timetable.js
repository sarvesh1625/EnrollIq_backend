/**
 * EnrollIQ — class timetable (routes)
 * Save as:  backend/src/routes/timetable.js
 * Mount in server.js:  app.use('/api/timetable', require('./routes/timetable'))
 */
const router = require('express').Router()
const { protect } = require('../middleware/auth')
const ctrl = require('../controllers/timetableController')

router.use(protect)
router.get   ('/options', ctrl.options)
router.get   ('/me',      ctrl.mine)
router.get   ('/',        ctrl.getClass)
router.put   ('/class',   ctrl.saveClass)
router.delete('/class',   ctrl.clearClass)

module.exports = router