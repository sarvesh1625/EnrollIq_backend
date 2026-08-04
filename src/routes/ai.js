const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { scoreLead, rescoreAll, getInsights } = require('../controllers/aiController')
router.use(protect)
router.post('/score-lead',  scoreLead)
router.post('/rescore-all', rescoreAll)
router.get('/insights',     getInsights)
module.exports = router
