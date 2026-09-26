const express = require('express')
const router  = express.Router()
const ctrl    = require('../controllers/googleAdsController')
const { protect, requireAdmin } = require('../middleware/auth')

router.get   ('/connect-url', protect, requireAdmin, ctrl.getConnectUrl)
router.get   ('/callback',    ctrl.callback)
router.get   ('/status',      protect, requireAdmin, ctrl.status)
router.post  ('/customer-id', protect, requireAdmin, ctrl.setCustomerId)
router.delete('/disconnect',  protect, requireAdmin, ctrl.disconnect)

module.exports = router