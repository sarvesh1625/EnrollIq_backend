const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { superAuth } = require('../routes/superadmin')
const {
  myFeatures, schoolFeatures, setPlan, setOverride
} = require('../controllers/featuresController')

// Admin (regular user): what features does MY school have?
router.get('/mine', protect, myFeatures)

// Super admin endpoints — use superAuth (checks super_admins token), NOT protect.
router.get('/school/:id',          superAuth, schoolFeatures)
router.put('/school/:id/plan',     superAuth, setPlan)
router.put('/school/:id/override', superAuth, setOverride)

module.exports = router