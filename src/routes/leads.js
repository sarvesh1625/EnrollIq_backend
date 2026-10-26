const router = require('express').Router()
const { protect, requireAdmin } = require('../middleware/auth')
const {
  getLeads, getLeadStats, getLead,
  createLead, updateLead, updateLeadStatus, deleteLead,
  addInteraction, createPublicLead,
} = require('../controllers/leadsController')
const {
  listCounsellors, updateSettings, updateCounsellor,
  assignLead, assignUnassigned, assignmentHistory, counsellorLeads, assignBulk,
} = require('../controllers/leadAssignmentController')

router.post('/public', createPublicLead)
router.use(protect)
router.get('/stats',             getLeadStats)

// Lead assignment (admin only). These fixed paths must stay ABOVE '/:id'.
router.get('/counsellors',            requireAdmin, listCounsellors)
router.put('/counsellors/settings',   requireAdmin, updateSettings)
router.put('/counsellors/:userId',    requireAdmin, updateCounsellor)
router.get('/counsellors/:userId/leads', requireAdmin, counsellorLeads)
router.put('/assign-bulk',            requireAdmin, assignBulk)
router.post('/assign-unassigned',     requireAdmin, assignUnassigned)

router.get('/',                  getLeads)
router.get('/:id',               getLead)
router.get('/:id/assignments',   requireAdmin, assignmentHistory)
router.put('/:id/assign',        requireAdmin, assignLead)
router.post('/',                 createLead)
router.put('/:id',               updateLead)
router.patch('/:id/status',      updateLeadStatus)
router.delete('/:id',            deleteLead)
router.post('/:id/interactions', addInteraction)
module.exports = router