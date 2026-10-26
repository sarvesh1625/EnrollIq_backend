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
  listAnswerSheets, approveAnswerSheet,
  getInsights,
} = require('../controllers/aiExamController')
const { uploadAndGradePages, MAX_PAGES } = require('../controllers/multiPageGradeController')

// Keep answer sheet images / lesson PDFs in memory — we only need the
// buffer to send to Claude/Groq or pdf-parse, no need to persist to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Answer sheets: up to MAX_PAGES page photos in one go (field "images"); the old single field "image" still works.
const pageUpload = upload.fields([{ name: 'images', maxCount: MAX_PAGES }, { name: 'image', maxCount: 1 }])
const acceptPages = (req, res, next) => pageUpload(req, res, (err) => {
  if (!err) return next()
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'A page is too large. Use photos under 3 MB.'
            : (err.code === 'LIMIT_UNEXPECTED_FILE' ? `You can upload up to ${MAX_PAGES} pages at a time.` : 'Could not read the upload.')
  res.status(400).json({ message: msg })
})

router.use(protect)

router.post('/extract-topics',           upload.single('pdf'), extractTopics)

router.post('/papers',                  createPaper)
router.get('/papers/:examId',            listPapers)
router.get('/papers/:id/questions',      getPaperQuestions)
router.put('/papers/:id/approve',        approvePaper)

router.post('/answer-sheets',            acceptPages, uploadAndGradePages)
router.get('/answer-sheets/:examId',     listAnswerSheets)
router.post('/answer-sheets/:id/approve', approveAnswerSheet)

router.get('/insights/:studentId/:examId', getInsights)

module.exports = router