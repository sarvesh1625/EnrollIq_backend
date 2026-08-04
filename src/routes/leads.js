const router = require('express').Router()
const { protect } = require('../middleware/auth')
const {
  getLeads, getLeadStats, getLead,
  createLead, updateLead, updateLeadStatus, deleteLead,
  addInteraction, createPublicLead,
} = require('../controllers/leadsController')

router.post('/public', createPublicLead)
router.use(protect)
router.get('/stats',             getLeadStats)
router.get('/',                  getLeads)
router.get('/:id',               getLead)
router.post('/',                 createLead)
router.put('/:id',               updateLead)
router.patch('/:id/status',      updateLeadStatus)
router.delete('/:id',            deleteLead)
router.post('/:id/interactions', addInteraction)
module.exports = router