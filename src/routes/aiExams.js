/**
 * src/routes/aiExams.js
 * Mount in server.js:  app.use('/api/ai-exams', require('./routes/aiExams'))
 *
 * Requires: npm install multer
 */
const router = require('express').Router()
const multer = require('multer')
const { protect } = require('../middleware/auth')
const {
  extractTopics,
  createPaper, listPapers, getPaperQuestions, approvePaper,
  uploadAndGrade, listAnswerSheets, approveAnswerSheet,
  getInsights,
} = require('../controllers/aiExamController')

// Keep answer sheet images / lesson PDFs in memory — we only need the
// buffer to send to Claude/Groq or pdf-parse, no need to persist to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.use(protect)

router.post('/extract-topics',           upload.single('pdf'), extractTopics)

router.post('/papers',                  createPaper)
router.get('/papers/:examId',            listPapers)
router.get('/papers/:id/questions',      getPaperQuestions)
router.put('/papers/:id/approve',        approvePaper)

router.post('/answer-sheets',            upload.single('image'), uploadAndGrade)
router.get('/answer-sheets/:examId',     listAnswerSheets)
router.post('/answer-sheets/:id/approve', approveAnswerSheet)

router.get('/insights/:studentId/:examId', getInsights)

module.exports = router