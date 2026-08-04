const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { importLeads, importStudents, getImportHistory } = require('../controllers/importController')
router.use(protect)
router.post('/leads',    importLeads)
router.post('/students', importStudents)
router.get('/history',   getImportHistory)
module.exports = router