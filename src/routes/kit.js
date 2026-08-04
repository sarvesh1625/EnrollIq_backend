/**
 * EnrollIQ — School Kit routes
 * Save as: src/routes/kit.js
 *
 * Wire in server.js:
 *   app.use('/api/kit', require('./routes/kit'))
 */
const express = require('express')
const router  = express.Router()
const ctrl    = require('../controllers/kitController')
const { protect } = require('../middleware/auth')

router.use(protect)

// Items master
router.get   ('/items',              ctrl.listItems)
router.post  ('/items',              ctrl.createItem)
router.put   ('/items/:id',          ctrl.updateItem)
router.delete('/items/:id',          ctrl.deleteItem)

// Class templates
router.get   ('/templates/:class',   ctrl.getTemplate)
router.put   ('/templates/:class',   ctrl.saveTemplate)

// Students + checklists
router.get   ('/students',           ctrl.listStudents)
router.get   ('/students/:studentId', ctrl.getStudentKit)

// Issuing + updates
router.post  ('/issue',              ctrl.issueItems)
router.put   ('/issues/:id',         ctrl.updateIssue)

// Dashboard
router.get   ('/overview',           ctrl.overview)

module.exports = router