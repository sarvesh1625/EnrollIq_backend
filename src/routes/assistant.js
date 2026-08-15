const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { ask } = require('../controllers/assistantController')

// POST /api/assistant/ask  — admin asks a question, gets a read-only answer
router.post('/ask', protect, ask)

module.exports = router