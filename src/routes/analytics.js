const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { getOverview } = require('../controllers/analyticsController')

router.use(protect)
router.get('/overview', getOverview)
module.exports = router