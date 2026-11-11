/**
 * Save as: backend/src/routes/branding.js
 * Mount in server.js:  app.use('/api/branding', require('./routes/branding'))
 */
const router = require('express').Router()
const { protect } = require('../middleware/auth')
const ctrl = require('../controllers/brandingController')

router.use(protect)
router.get   ('/mine', ctrl.mine)
router.post  ('/logo', ctrl.setLogo)
router.delete('/logo', ctrl.clearLogo)

module.exports = router