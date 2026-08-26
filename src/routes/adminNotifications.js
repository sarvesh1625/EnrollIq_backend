const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { getNotifications } = require('../controllers/adminNotificationsController')

// GET /api/communication/notifications  (dashboard live feed)
router.get('/notifications', protect, getNotifications)

module.exports = router