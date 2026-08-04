const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { login, getMe, changePassword } = require('../controllers/authController')

router.post('/login',   login)
router.get('/me',       protect, getMe)
router.put('/password', protect, changePassword)
module.exports = router