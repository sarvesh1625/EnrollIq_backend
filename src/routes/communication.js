const router = require('express').Router()
const { protect } = require('../middleware/auth')
const {
  getMessages, sendMessage,
  getAnnouncements, sendAnnouncement,
  getNotifications, markAllRead,
  getCommStats,
} = require('../controllers/communicationController')

router.use(protect)
router.get('/stats',                    getCommStats)
router.get('/messages',                 getMessages)
router.post('/messages',                sendMessage)
router.get('/announcements',            getAnnouncements)
router.post('/announcements',           sendAnnouncement)
router.get('/notifications',            getNotifications)
router.patch('/notifications/read-all', markAllRead)
module.exports = router