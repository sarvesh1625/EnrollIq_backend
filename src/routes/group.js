const router = require('express').Router()
const { protect, requireChairman } = require('../middleware/auth')
const { getOverview, listBranches } = require('../controllers/groupDashboardController')
const { ask } = require('../controllers/groupAssistantController')

router.use(protect, requireChairman)
router.get ('/overview',       getOverview)
router.get ('/branches',       listBranches)
router.post('/assistant/ask',  ask)

module.exports = router