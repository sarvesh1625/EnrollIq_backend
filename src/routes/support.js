const express = require('express')
const router  = express.Router()
const ctrl    = require('../controllers/supportController')
const { protect } = require('../middleware/auth')
const { superAuth } = require('./superadmin')

// School-side (any logged-in staff member) — static paths first
router.post('/message',      protect, ctrl.sendMessage)   // open a new ticket
router.get ('/my-messages',  protect, ctrl.myMessages)    // list this school's tickets

// Superadmin-side — MUST be registered BEFORE the dynamic '/:id/messages' routes
// below. Express matches routes top-to-bottom, and '/:id/messages' would otherwise
// greedily match '/admin/messages' too (treating "admin" as the :id), routing it
// through the wrong (school) auth middleware instead of superAuth.
router.get  ('/admin/messages',     superAuth, ctrl.listAll)
router.get  ('/admin/:id/messages', superAuth, ctrl.getThreadAsAdmin)
router.post ('/admin/:id/messages', superAuth, ctrl.replyAsAdmin)
router.patch('/admin/messages/:id', superAuth, ctrl.updateStatus)

// School-side dynamic routes — must come AFTER '/admin/*' so they don't shadow it
router.get ('/:id/messages', protect, ctrl.getThread)      // full thread for one ticket
router.post('/:id/messages', protect, ctrl.replyAsSchool)  // reply on that ticket

module.exports = router