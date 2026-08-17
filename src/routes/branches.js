const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { myBranches, switchBranch, createBranch } = require('../controllers/branchController')

router.get('/mine',    protect, myBranches)
router.put('/switch',  protect, switchBranch)
router.post('/',       protect, createBranch)

module.exports = router