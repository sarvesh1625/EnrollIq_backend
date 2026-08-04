/**
 * EnrollIQ — Academic Year + Promotion routes
 * Save as: src/routes/academic.js
 *
 * Wire in server.js:
 *   app.use('/api/academic', require('./routes/academic'))
 */
const express = require('express')
const router  = express.Router()
const ctrl    = require('../controllers/academicController')
const { protect } = require('../middleware/auth')

router.use(protect)

router.get ('/years',                 ctrl.listYears)
router.post('/years',                 ctrl.createYear)
router.put ('/years/:id/activate',    ctrl.activateYear)

router.get ('/promotion/candidates',  ctrl.candidates)
router.post('/promotion',             ctrl.promote)

router.get ('/students/:id/history',  ctrl.history)

module.exports = router