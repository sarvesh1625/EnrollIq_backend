const router = require('express').Router()
const { protect, requireChairman } = require('../middleware/auth')
const { myBranches, switchBranch, createBranch } = require('../controllers/branchController')

router.get('/mine',    protect, myBranches)
// Only a chairman can switch which branch they're viewing/editing — a branch admin
// must never be able to hop into another branch's data, even inside their own group.
router.put('/switch',  protect, requireChairman, switchBranch)
// Same reasoning for adding a new branch to the group — a branch admin shouldn't be
// able to expand their own group's footprint; only a chairman can do that.
router.post('/',       protect, requireChairman, createBranch)

module.exports = router