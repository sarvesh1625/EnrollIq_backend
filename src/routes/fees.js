const router = require('express').Router()
const { protect } = require('../middleware/auth')
const {
  getFeeStats, getPayments, createPayment, recordPayment,
  getFeeStructures, createFeeStructure,
} = require('../controllers/feesController')

router.use(protect)
router.get('/stats',              getFeeStats)
router.get('/payments',           getPayments)
router.post('/payments',          createPayment)
router.patch('/payments/:id/pay', recordPayment)
router.get('/structures',         getFeeStructures)
router.post('/structures',        createFeeStructure)
module.exports = router