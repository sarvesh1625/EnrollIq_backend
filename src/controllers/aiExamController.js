/**
 * src/controllers/aiExamController.js
 *
 *  POST /api/ai-exams/papers                 generate a question paper (AI)
 *  GET  /api/ai-exams/papers/:examId         list papers for an exam
 *  GET  /api/ai-exams/papers/:id/questions   get questions for a paper
 *  PUT  /api/ai-exams/papers/:id/approve     lock a paper (teacher approved it)
 *
 *  POST /api/ai-exams/answer-sheets          upload + AI-grade an answer sheet image
 *  GET  /api/ai-exams/answer-sheets/:examId  list graded sheets for an exam
 *  POST /api/ai-exams/answer-sheets/:id/approve
 *       approve AI marks -> writes into exam_marks (reuses existing marks flow)
 *
 *  GET  /api/ai-exams/insights/:studentId/:examId   get/generate AI insights
 */
const { pool } = require('../db/pool')
const { notifyParent } = require('../services/notificationService')

function safeParseOptions(v) {
  if (v == null) return null
  if (Array.isArray(v)) return v
  try { return JSON.parse(v) } catch {}
  try { return JSON.parse(JSON.parse(v)) } catch {}
  return null
}
const { generateQuestionPaper, gradeAnswerSheet, generateInsights } = require('../services/aiService')
const { extractTextFromPdf } = require('../services/pdfService')

function calcGrade(marks, maxMarks = 100) {
  const pct = (marks / maxMarks) * 100
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 35) return 'D'
  return 'F'
}

/* ── LESSON PDF -> TOPICS EXTRACTION ─────────────────────────────── */

// POST /api/ai-exams/extract-topics  (multipart/form-data: pdf)
async function extractTopics(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'pdf file is required' })
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Only PDF files are supported here' })
    }

    const topics = await extractTextFromPdf(req.file.buffer)
    res.json({ topics, source_filename: req.file.originalname })
  } catch (err) {
    if (err.message?.includes('No readable text found')) {
      return res.status(422).json({ message: err.message })
    }
    next(err)
  }
}

/* ── QUESTION PAPER GENERATION ─────────────────────────────────── */

// POST /api/ai-exams/papers
async function createPaper(req, res, next) {
  try {
    const { exam_id, subject_id, class_name, topics, difficulty, total_marks, question_mix } = req.body
    const schoolId = req.user.school_id

    if (!exam_id || !subject_id || !topics) {
      return res.status(400).json({ message: 'exam_id, subject_id and topics are required' })
    }

    const [[subject]] = await pool.execute('SELECT name FROM subjects WHERE id=? AND school_id=?', [subject_id, schoolId])
    if (!subject) return res.status(404).json({ message: 'Subject not found' })

    const questions = await generateQuestionPaper({
      subject: subject.name, class_name, topics, difficulty, total_marks, question_mix,
    })

    const [paperResult] = await pool.execute(
      `INSERT INTO question_papers (school_id, exam_id, subject_id, class_name, topics, difficulty, total_marks, generated_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [schoolId, exam_id, subject_id, class_name || null, topics, difficulty || 'Medium', total_marks || 100, req.user.id]
    )
    const paperId = paperResult.insertId

    for (const q of questions) {
      await pool.execute(
        `INSERT INTO exam_questions (paper_id, question_number, question_text, question_type, options, correct_answer, marks)
         VALUES (?,?,?,?,?,?,?)`,
        [paperId, q.question_number, q.question_text, q.question_type || 'Short Answer',
         q.options ? JSON.stringify(q.options) : null, q.correct_answer || null, q.marks || 1]
      )
    }

    const [savedQuestions] = await pool.execute('SELECT * FROM exam_questions WHERE paper_id=? ORDER BY question_number', [paperId])
    res.status(201).json({ paper_id: paperId, questions: savedQuestions })
  } catch (err) {
    if (err.message?.includes('did not return a valid question list') || err instanceof SyntaxError) {
      return res.status(502).json({ message: 'AI could not generate a valid question paper. Try again or adjust the topics.' })
    }
    next(err)
  }
}

// GET /api/ai-exams/papers/:examId
async function listPapers(req, res, next) {
  try {
    const [papers] = await pool.execute(`
      SELECT qp.*, sub.name AS subject_name,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.paper_id = qp.id) AS question_count
      FROM question_papers qp
      JOIN subjects sub ON sub.id = qp.subject_id
      WHERE qp.exam_id=? AND qp.school_id=?
      ORDER BY qp.created_at DESC
    `, [req.params.examId, req.user.school_id])
    res.json(papers)
  } catch (err) { next(err) }
}

// GET /api/ai-exams/papers/:id/questions
async function getPaperQuestions(req, res, next) {
  try {
    const [questions] = await pool.execute(
      'SELECT * FROM exam_questions WHERE paper_id=? ORDER BY question_number', [req.params.id]
    )
    res.json(questions.map(q => ({ ...q, options: safeParseOptions(q.options) })))
  } catch (err) { next(err) }
}

// PUT /api/ai-exams/papers/:id/approve
async function approvePaper(req, res, next) {
  try {
    await pool.execute(`UPDATE question_papers SET status='Approved' WHERE id=? AND school_id=?`, [req.params.id, req.user.school_id])
    res.json({ message: 'Paper approved' })
  } catch (err) { next(err) }
}

/* ── ANSWER SHEET GRADING ──────────────────────────────────────── */

// POST /api/ai-exams/answer-sheets  (multipart/form-data: image, exam_id, student_id, subject_id, paper_id?)
async function uploadAndGrade(req, res, next) {
  try {
    const { exam_id, student_id, subject_id, paper_id } = req.body
    const schoolId = req.user.school_id
    if (!req.file) return res.status(400).json({ message: 'image file is required' })
    if (!exam_id || !student_id || !subject_id) {
      return res.status(400).json({ message: 'exam_id, student_id and subject_id are required' })
    }

    let questions = []
    let maxMarks = 100
    if (paper_id) {
      const [rows] = await pool.execute('SELECT * FROM exam_questions WHERE paper_id=? ORDER BY question_number', [paper_id])
      questions = rows.map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : null }))
      maxMarks = questions.reduce((sum, q) => sum + Number(q.marks || 0), 0) || 100
    } else {
      const [[sub]] = await pool.execute('SELECT max_marks FROM subjects WHERE id=?', [subject_id])
      maxMarks = sub?.max_marks || 100
    }

    const imageBase64 = req.file.buffer.toString('base64')
    const mediaType = req.file.mimetype

    const result = await gradeAnswerSheet({ imageBase64, mediaType, questions, maxMarks })

    const [insertResult] = await pool.execute(
      `INSERT INTO answer_sheets
         (school_id, exam_id, student_id, subject_id, paper_id, image_path, ai_marks, max_marks, ai_feedback, question_breakdown, status, graded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'Graded', NOW())`,
      [schoolId, exam_id, student_id, subject_id, paper_id || null,
       req.file.originalname || null, result.total_marks_awarded, result.max_marks || maxMarks,
       result.overall_feedback || null, JSON.stringify(result.questions || [])]
    )

    const [rows] = await pool.execute('SELECT * FROM answer_sheets WHERE id=?', [insertResult.insertId])
    res.status(201).json({ ...rows[0], question_breakdown: result.questions })
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ message: 'AI could not read this answer sheet clearly. Try a clearer photo.' })
    }
    next(err)
  }
}

// GET /api/ai-exams/answer-sheets/:examId
async function listAnswerSheets(req, res, next) {
  try {
    const [sheets] = await pool.execute(`
      SELECT as1.*, s.name AS student_name, s.roll_number, sub.name AS subject_name
      FROM answer_sheets as1
      JOIN students s ON s.id = as1.student_id
      JOIN subjects sub ON sub.id = as1.subject_id
      WHERE as1.exam_id=? AND as1.school_id=?
      ORDER BY as1.created_at DESC
    `, [req.params.examId, req.user.school_id])
    res.json(sheets)
  } catch (err) { next(err) }
}

// POST /api/ai-exams/answer-sheets/:id/approve — teacher confirms AI marks, writes to exam_marks
async function approveAnswerSheet(req, res, next) {
  try {
    const { marks_override } = req.body // optional teacher correction
    const [[sheet]] = await pool.execute('SELECT * FROM answer_sheets WHERE id=? AND school_id=?', [req.params.id, req.user.school_id])
    if (!sheet) return res.status(404).json({ message: 'Answer sheet not found' })

    const finalMarks = marks_override !== undefined ? marks_override : sheet.ai_marks
    const grade = calcGrade(finalMarks, sheet.max_marks)

    await pool.execute(`
      INSERT INTO exam_marks (school_id, exam_id, student_id, subject_id, marks, max_marks, grade, entered_by)
      VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE marks=VALUES(marks), max_marks=VALUES(max_marks), grade=VALUES(grade), entered_by=VALUES(entered_by)
    `, [sheet.school_id, sheet.exam_id, sheet.student_id, sheet.subject_id, finalMarks, sheet.max_marks, grade, req.user.id])

    await pool.execute(`UPDATE answer_sheets SET status='Approved', reviewed_by=? WHERE id=?`, [req.user.id, req.params.id])

    // notify parent that results are published
    try {
      const [[st]] = await pool.execute('SELECT id, name, parent_phone FROM students WHERE id=?', [sheet.student_id])
      if (st?.parent_phone) {
        notifyParent({ schoolId: sheet.school_id, studentId: st.id, parentPhone: st.parent_phone,
          type: 'test_graded', title: `Results published for ${st.name}`,
          body: `Marks: ${finalMarks} · Grade ${grade}`, link: 'results' })
      }
    } catch {}

    res.json({ message: 'Marks approved and saved', marks: finalMarks, grade })
  } catch (err) { next(err) }
}

/* ── AI INSIGHTS ───────────────────────────────────────────────── */

// GET /api/ai-exams/insights/:studentId/:examId
async function getInsights(req, res, next) {
  try {
    const { studentId, examId } = req.params
    const schoolId = req.user.school_id

    const [[cached]] = await pool.execute(
      'SELECT * FROM report_card_insights WHERE student_id=? AND exam_id=?', [studentId, examId]
    )
    if (cached && req.query.refresh !== 'true') {
      return res.json({
        ...cached,
        weak_subjects: JSON.parse(cached.weak_subjects || '[]'),
        strong_subjects: JSON.parse(cached.strong_subjects || '[]'),
      })
    }

    const [[student]] = await pool.execute('SELECT name, class FROM students WHERE id=? AND school_id=?', [studentId, schoolId])
    if (!student) return res.status(404).json({ message: 'Student not found' })

    const [currentMarks] = await pool.execute(`
      SELECT em.marks, em.max_marks, sub.name AS subject_name
      FROM exam_marks em JOIN subjects sub ON sub.id = em.subject_id
      WHERE em.student_id=? AND em.exam_id=? AND em.school_id=?
    `, [studentId, examId, schoolId])

    if (!currentMarks.length) {
      return res.status(400).json({ message: 'No marks entered for this exam yet' })
    }

    const [history] = await pool.execute(`
      SELECT rc.percentage, e.name AS exam_name
      FROM report_cards rc JOIN exams e ON e.id = rc.exam_id
      WHERE rc.student_id=? AND rc.school_id=? AND rc.exam_id != ?
      ORDER BY e.start_date DESC LIMIT 5
    `, [studentId, schoolId, examId])

    const insights = await generateInsights({
      student_name: student.name, class_name: student.class, current_marks: currentMarks, history,
    })

    await pool.execute(`
      INSERT INTO report_card_insights (school_id, student_id, exam_id, summary, weak_subjects, strong_subjects, trend, alert_level)
      VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE summary=VALUES(summary), weak_subjects=VALUES(weak_subjects),
        strong_subjects=VALUES(strong_subjects), trend=VALUES(trend), alert_level=VALUES(alert_level)
    `, [schoolId, studentId, examId, insights.summary,
        JSON.stringify(insights.weak_subjects || []), JSON.stringify(insights.strong_subjects || []),
        insights.trend || 'Stable', insights.alert_level || 'None'])

    res.json(insights)
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ message: 'AI could not analyze this report card. Try again.' })
    }
    next(err)
  }
}

module.exports = {
  extractTopics,
  createPaper, listPapers, getPaperQuestions, approvePaper,
  uploadAndGrade, listAnswerSheets, approveAnswerSheet,
  getInsights,
}