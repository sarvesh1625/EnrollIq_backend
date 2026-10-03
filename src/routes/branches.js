const router = require('express').Router()
const { protect, requireChairman } = require('../middleware/auth')
const { myBranches, switchBranch, createBranch } = require('../controllers/branchController')

router.get('/mine',    protect, myBranches)
// Only a chairman can switch which branch they're viewing/editing — a branch admin
// must never be able to hop into another branch's data, even inside their own group.
router.put('/switch',  protect, requireChairman, switchBranch)
router.post('/',       protect, createBranch)

module.exports = router