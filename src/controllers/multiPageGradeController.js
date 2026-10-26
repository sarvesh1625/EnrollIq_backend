/**
 * EnrollIQ — upload + AI-grade an answer sheet made of 1-20 page photos
 * Save as:  backend/src/controllers/multiPageGradeController.js
 * POST /api/ai-exams/answer-sheets   multipart: images (many)  — or the old single field "image"
 *                                    + exam_id, student_id, subject_id, paper_id?
 */
const { pool } = require('../db/pool')
const { gradeAnswerSheetPages } = require('../services/multiPageGrading')

const MAX_PAGES = 20
const MAX_BYTES = 3 * 1000 * 1000                       // ~4 MB once base64-encoded: the AI's per-image limit
const OK_TYPES  = ['image/jpeg', 'image/png', 'image/webp']

async function uploadAndGradePages(req, res, next) {
  try {
    const { exam_id, student_id, subject_id, paper_id } = req.body
    const schoolId = req.user.school_id
    const files = [...(req.files?.images || []), ...(req.files?.image || [])]

    if (!files.length) return res.status(400).json({ message: 'Add at least one page of the answer sheet.' })
    if (files.length > MAX_PAGES) return res.status(400).json({ message: `You can upload up to ${MAX_PAGES} pages at a time.` })
    if (!exam_id || !student_id || !subject_id) return res.status(400).json({ message: 'exam_id, student_id and subject_id are required' })
    for (let i = 0; i < files.length; i++) {
      if (!OK_TYPES.includes(files[i].mimetype))
        return res.status(400).json({ message: `Page ${i + 1} is not a JPG, PNG or WebP photo. (iPhone HEIC photos: set the camera to "Most Compatible".)` })
      if (files[i].size > MAX_BYTES)
        return res.status(400).json({ message: `Page ${i + 1} is too large. Use a smaller photo (under 3 MB).` })
    }

    let questions = [], maxMarks = 100
    if (paper_id) {
      const [rows] = await pool.execute('SELECT * FROM exam_questions WHERE paper_id=? ORDER BY question_number', [paper_id])
      questions = rows.map(q => ({ ...q, options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : null }))
      maxMarks = questions.reduce((s, q) => s + Number(q.marks || 0), 0) || 100
    } else {
      const [[sub]] = await pool.execute('SELECT max_marks FROM subjects WHERE id=?', [subject_id])
      maxMarks = sub?.max_marks || 100
    }

    const pages = files.map(f => ({ base64: f.buffer.toString('base64'), mediaType: f.mimetype }))
    const result = await gradeAnswerSheetPages({ pages, questions, maxMarks })

    const label = files.length === 1 ? (files[0].originalname || 'answer.jpg') : `${files.length} pages`
    const [ins] = await pool.execute(
      `INSERT INTO answer_sheets
         (school_id, exam_id, student_id, subject_id, paper_id, image_path, extracted_text, ai_marks, max_marks, ai_feedback, question_breakdown, status, graded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'Graded', NOW())`,
      [schoolId, exam_id, student_id, subject_id, paper_id || null, label, result.transcript || null,
       result.total_marks_awarded, result.max_marks || maxMarks, result.overall_feedback || null,
       JSON.stringify(result.questions || [])])

    const [rows] = await pool.execute('SELECT * FROM answer_sheets WHERE id=?', [ins.insertId])
    res.status(201).json({ ...rows[0], question_breakdown: result.questions })
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(502).json({ message: 'AI could not read these pages clearly. Try clearer, well-lit photos.' })
    if (err.status === 429) return res.status(503).json({ message: 'The AI is busy right now. Please try again in a minute.' })
    if (err.pageError) return res.status(502).json({ message: err.message + ' Try again with clearer photos.' })
    next(err)
  }
}

module.exports = { uploadAndGradePages, MAX_PAGES }