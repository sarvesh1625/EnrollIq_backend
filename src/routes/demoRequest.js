const router = require('express').Router()
const { createDemoRequest, listDemoRequests } = require('../controllers/demoRequestController')

// PUBLIC — landing page demo form
router.post('/', createDemoRequest)
// (optional) list for super admin — add your superAuth middleware if desired
router.get('/', listDemoRequests)

module.exports = router