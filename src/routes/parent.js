const router  = require('express').Router()
const { pool } = require('../db/pool')
const jwt      = require('jsonwebtoken')
const multer   = require('multer')
const { gradeAnswerSheet, gradeTextAnswers } = require('../services/aiService')
const { getPostsForStudent } = require('../controllers/diaryController')
const { resolveFeatures } = require('../controllers/featuresController')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

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

async function verifyChild(parentPhone, studentId) {
  const [rows] = await pool.execute(
    'SELECT * FROM students WHERE id=? AND parent_phone=?', [studentId, parentPhone])
  return rows[0] || null
}

// options may be a JSON string, an already-parsed array, or null — handle all
function safeOptions(v) {
  if (v == null) return null
  if (Array.isArray(v)) return v
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}

// ── Parent Auth Middleware ────────────────────────────────────────────────────
function parentAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'parent') return res.status(403).json({ message: 'Not authorized' })
    req.parent = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Session expired. Please login again.' })
  }
}

// ── POST /api/parent/login ────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ message: 'Phone number required' })

    const cleanPhone = phone.replace(/\D/g,'').slice(-10)

    const [students] = await pool.execute(`
      SELECT DISTINCT s.parent_name, s.parent_phone, s.school_id
      FROM students s
      WHERE s.parent_phone = ? AND s.status = 'Active'
      LIMIT 1
    `, [cleanPhone])

    if (!students.length) {
      return res.status(401).json({ message: 'Phone number not registered. Contact school admin.' })
    }

    const parent = students[0]
    const token  = jwt.sign(
      { phone: cleanPhone, school_id: parent.school_id, role: 'parent' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({
      token,
      parent: {
        name:      parent.parent_name || 'Parent',
        phone:     parent.parent_phone,
        school_id: parent.school_id,
      }
    })
  } catch (err) { next(err) }
})

// ── GET /api/parent/children ──────────────────────────────────────────────────
router.get('/children', parentAuth, async (req, res, next) => {
  try {
    const { phone, school_id } = req.parent

    const [children] = await pool.execute(`
      SELECT
        s.id, s.name, s.class, s.roll_number,
        s.parent_name, s.parent_phone, s.area,
        b.bus_number, r.route_name,
        r.start_time AS pickup_time,
        rs.stop_name,
        d.name AS driver_name, d.phone AS driver_phone,
        st.qr_code,
        (SELECT ta.trip_type
         FROM transport_attendance ta
         WHERE ta.student_id = s.id
         AND DATE(ta.scanned_at) = CURDATE()
         ORDER BY ta.scanned_at DESC LIMIT 1) AS today_status,
        (SELECT ta.scanned_at
         FROM transport_attendance ta
         WHERE ta.student_id = s.id
         AND DATE(ta.scanned_at) = CURDATE()
         ORDER BY ta.scanned_at DESC LIMIT 1) AS last_scan_time
      FROM students s
      LEFT JOIN student_transport st ON st.student_id = s.id AND st.status = 'Active'
      LEFT JOIN buses b ON b.id = st.bus_id
      LEFT JOIN transport_routes r ON r.id = st.route_id
      LEFT JOIN route_stops rs ON rs.id = st.stop_id
      LEFT JOIN drivers d ON d.bus_id = st.bus_id AND d.school_id = s.school_id AND d.status = 'Active'
      WHERE s.parent_phone = ? AND s.school_id = ? AND s.status = 'Active'
      ORDER BY s.name
    `, [phone, school_id])

    let features = {}
    try { const rf = await resolveFeatures(school_id); features = rf.features || {} } catch {}
    res.json({ children, features })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/attendance ──────────────────────────────────────
router.get('/child/:id/attendance', parentAuth, async (req, res, next) => {
  try {
    const { phone } = req.parent
    const studentId  = req.params.id

    const [verify] = await pool.execute(
      'SELECT id FROM students WHERE id=? AND parent_phone=?',
      [studentId, phone]
    )
    if (!verify.length) return res.status(403).json({ message: 'Not authorized' })

    const [records] = await pool.execute(`
      SELECT ta.*, b.bus_number, d.name AS driver_name
      FROM transport_attendance ta
      LEFT JOIN buses b ON b.id = ta.bus_id
      LEFT JOIN drivers d ON d.id = ta.driver_id
      WHERE ta.student_id = ?
      ORDER BY ta.scanned_at DESC
      LIMIT 50
    `, [studentId])

    res.json({ records })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/fees ────────────────────────────────────────────
router.get('/child/:id/fees', parentAuth, async (req, res, next) => {
  try {
    const { phone } = req.parent
    const studentId = req.params.id
    const [verify] = await pool.execute(
      'SELECT id FROM students WHERE id=? AND parent_phone=?', [studentId, phone])
    if (!verify.length) return res.status(403).json({ message: 'Not authorized' })

    const [payments] = await pool.execute(`
      SELECT id, amount, paid_amount, status, due_date, fee_type, paid_date, created_at
      FROM payments WHERE student_id=?
      ORDER BY due_date DESC
    `, [studentId])

    const totalPaid = payments.reduce((s, p) => s + Number(p.paid_amount || 0), 0)
    const totalDue  = payments.reduce((s, p) => s + (Number(p.amount || 0) - Number(p.paid_amount || 0)), 0)

    res.json({ payments, summary: { total_paid: totalPaid, total_due: totalDue } })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/results ─────────────────────────────────────────
router.get('/child/:id/results', parentAuth, async (req, res, next) => {
  try {
    const { phone } = req.parent
    const studentId = req.params.id
    const [verify] = await pool.execute(
      'SELECT id FROM students WHERE id=? AND parent_phone=?', [studentId, phone])
    if (!verify.length) return res.status(403).json({ message: 'Not authorized' })

    const [marks] = await pool.execute(`
      SELECT em.marks, em.max_marks, em.grade,
             sub.name AS subject_name,
             e.id AS exam_id, e.name AS exam_name, e.exam_type, e.start_date
      FROM exam_marks em
      JOIN subjects sub ON sub.id = em.subject_id
      JOIN exams e ON e.id = em.exam_id
      WHERE em.student_id = ?
      ORDER BY e.start_date DESC, sub.name
    `, [studentId])

    // group by exam
    const examsMap = {}
    for (const m of marks) {
      if (!examsMap[m.exam_id]) {
        examsMap[m.exam_id] = {
          exam_id: m.exam_id, exam_name: m.exam_name, exam_type: m.exam_type,
          start_date: m.start_date, subjects: [],
          total_marks: 0, total_max: 0,
        }
      }
      examsMap[m.exam_id].subjects.push({
        subject: m.subject_name, marks: m.marks, max_marks: m.max_marks, grade: m.grade,
      })
      examsMap[m.exam_id].total_marks += Number(m.marks || 0)
      examsMap[m.exam_id].total_max   += Number(m.max_marks || 0)
    }
    const exams = Object.values(examsMap).map(e => ({
      ...e,
      percentage: e.total_max ? Math.round((e.total_marks / e.total_max) * 100) : null,
    }))

    res.json({ exams })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/insights ────────────────────────────────────────
// AI insights from the exam engine (report_card_insights table)
router.get('/child/:id/insights', parentAuth, async (req, res, next) => {
  try {
    const { phone } = req.parent
    const studentId = req.params.id
    const [verify] = await pool.execute(
      'SELECT id FROM students WHERE id=? AND parent_phone=?', [studentId, phone])
    if (!verify.length) return res.status(403).json({ message: 'Not authorized' })

    const [rows] = await pool.execute(`
      SELECT rci.*, e.name AS exam_name, e.start_date
      FROM report_card_insights rci
      JOIN exams e ON e.id = rci.exam_id
      WHERE rci.student_id = ?
      ORDER BY e.start_date DESC
    `, [studentId])

    const insights = rows.map(r => ({
      exam_name: r.exam_name,
      summary: r.summary,
      weak_subjects: safeParse(r.weak_subjects),
      strong_subjects: safeParse(r.strong_subjects),
      trend: r.trend,
      alert_level: r.alert_level,
    }))

    res.json({ insights })
  } catch (err) { next(err) }
})

function safeParse(v) { try { return JSON.parse(v || '[]') } catch { return [] } }

// ── GET /api/parent/child/:id/available-tests ─────────────────────────────────
// approved papers for exams in the child's class that they haven't submitted yet
router.get('/child/:id/available-tests', parentAuth, async (req, res, next) => {
  try {
    const student = await verifyChild(req.parent.phone, req.params.id)
    if (!student) return res.status(403).json({ message: 'Not authorized' })

    const [papers] = await pool.execute(`
      SELECT qp.id AS paper_id, qp.exam_id, qp.difficulty, qp.total_marks,
             e.name AS exam_name, sub.name AS subject_name, sub.id AS subject_id,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.paper_id = qp.id) AS question_count,
             (SELECT COUNT(*) FROM answer_sheets a WHERE a.paper_id = qp.id AND a.student_id = ?) AS already_submitted
      FROM question_papers qp
      JOIN exams e ON e.id = qp.exam_id
      JOIN subjects sub ON sub.id = qp.subject_id
      WHERE qp.school_id = ? AND qp.status = 'Approved'
        AND (qp.class_name = ? OR qp.class_name IS NULL)
      ORDER BY qp.created_at DESC
    `, [student.id, student.school_id, student.class])

    // only show tests not yet submitted
    const available = papers.filter(p => Number(p.already_submitted) === 0)
    res.json({ tests: available })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/test/:paperId ───────────────────────────────────
// the questions for a test (WITHOUT correct answers — student shouldn't see them)
router.get('/child/:id/test/:paperId', parentAuth, async (req, res, next) => {
  try {
    const student = await verifyChild(req.parent.phone, req.params.id)
    if (!student) return res.status(403).json({ message: 'Not authorized' })

    const [[paper]] = await pool.execute(
      `SELECT qp.*, e.name AS exam_name, sub.name AS subject_name
       FROM question_papers qp
       JOIN exams e ON e.id = qp.exam_id
       JOIN subjects sub ON sub.id = qp.subject_id
       WHERE qp.id=? AND qp.school_id=? AND qp.status='Approved'`,
      [req.params.paperId, student.school_id])
    if (!paper) return res.status(404).json({ message: 'Test not found' })

    const [questions] = await pool.execute(
      'SELECT id, question_number, question_text, question_type, options, marks FROM exam_questions WHERE paper_id=? ORDER BY question_number',
      [req.params.paperId])

    res.json({
      paper: { id: paper.id, exam_id: paper.exam_id, subject_id: paper.subject_id,
               exam_name: paper.exam_name, subject_name: paper.subject_name,
               difficulty: paper.difficulty, total_marks: paper.total_marks },
      questions: questions.map(q => ({ ...q, options: safeOptions(q.options) })),
    })
  } catch (err) { next(err) }
})

// ── POST /api/parent/child/:id/test/:paperId/submit ───────────────────────────
// Student submits: EITHER typed answers (JSON body 'answers') OR a photo (multipart 'image')
router.post('/child/:id/test/:paperId/submit', parentAuth, upload.single('image'), async (req, res, next) => {
  try {
    const student = await verifyChild(req.parent.phone, req.params.id)
    if (!student) return res.status(403).json({ message: 'Not authorized' })

    const [[paper]] = await pool.execute(
      `SELECT * FROM question_papers WHERE id=? AND school_id=? AND status='Approved'`,
      [req.params.paperId, student.school_id])
    if (!paper) return res.status(404).json({ message: 'Test not found' })

    // already submitted?
    const [[existing]] = await pool.execute(
      'SELECT id FROM answer_sheets WHERE paper_id=? AND student_id=?', [paper.id, student.id])
    if (existing) return res.status(400).json({ message: 'You have already submitted this test.' })

    const [qs] = await pool.execute('SELECT * FROM exam_questions WHERE paper_id=? ORDER BY question_number', [paper.id])
    const questions = qs.map(q => ({ ...q, options: safeOptions(q.options) }))
    const maxMarks = questions.reduce((s, q) => s + Number(q.marks || 0), 0) || paper.total_marks || 100

    let result
    let imagePath = null
    if (req.file) {
      // photo path — vision grading
      const imageBase64 = req.file.buffer.toString('base64')
      result = await gradeAnswerSheet({ imageBase64, mediaType: req.file.mimetype, questions, maxMarks })
      imagePath = req.file.originalname || 'answer.jpg'
    } else {
      // typed answers path — text grading
      let answers = req.body.answers
      if (typeof answers === 'string') { try { answers = JSON.parse(answers) } catch { answers = {} } }
      if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ message: 'Please answer the questions or upload a photo.' })
      }
      result = await gradeTextAnswers({ questions, answers, maxMarks })
      imagePath = 'typed'
    }

    // save as a graded answer sheet (status 'Graded' — teacher will approve later)
    const [ins] = await pool.execute(
      `INSERT INTO answer_sheets
         (school_id, exam_id, student_id, subject_id, paper_id, image_path, ai_marks, max_marks, ai_feedback, question_breakdown, status, graded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'Graded', NOW())`,
      [student.school_id, paper.exam_id, student.id, paper.subject_id, paper.id, imagePath,
       result.total_marks_awarded, result.max_marks || maxMarks,
       result.overall_feedback || null, JSON.stringify(result.questions || [])])

    res.status(201).json({
      message: 'Test submitted and graded! Your teacher will review it.',
      ai_marks: result.total_marks_awarded,
      max_marks: result.max_marks || maxMarks,
      grade: calcGrade(result.total_marks_awarded, result.max_marks || maxMarks),
      feedback: result.overall_feedback,
      submission_id: ins.insertId,
    })
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ message: 'AI could not read the answers clearly. Try again or use a clearer photo.' })
    }
    next(err)
  }
})

// ── GET /api/parent/child/:id/diary ───────────────────────────────────────────
// daily updates: diary, homework, activities for this child's class (+ personal)
router.get('/child/:id/diary', parentAuth, async (req, res, next) => {
  try {
    const student = await verifyChild(req.parent.phone, req.params.id)
    if (!student) return res.status(403).json({ message: 'Not authorized' })
    const posts = await getPostsForStudent(student.school_id, student)
    res.json({ posts })
  } catch (err) { next(err) }
})

// ── GET /api/parent/child/:id/attendance-full ─────────────────────────────────
// BOTH school (class_attendance) and transport (transport_attendance)
router.get('/child/:id/attendance-full', parentAuth, async (req, res, next) => {
  try {
    const student = await verifyChild(req.parent.phone, req.params.id)
    if (!student) return res.status(403).json({ message: 'Not authorized' })

    // school attendance (last 60 records) + summary
    const [school] = await pool.execute(
      `SELECT date, status, notes FROM class_attendance
       WHERE school_id=? AND student_id=? ORDER BY date DESC LIMIT 60`,
      [student.school_id, student.id])
    const [[pres]] = await pool.execute(
      `SELECT COUNT(*) c FROM class_attendance WHERE school_id=? AND student_id=? AND status='Present'`,
      [student.school_id, student.id])
    const [[tot]] = await pool.execute(
      `SELECT COUNT(*) c FROM class_attendance WHERE school_id=? AND student_id=?`,
      [student.school_id, student.id])

    // transport attendance (last 50 scans)
    let transport = []
    try {
      const [t] = await pool.execute(
        `SELECT ta.*, b.bus_number FROM transport_attendance ta
         LEFT JOIN buses b ON b.id = ta.bus_id
         WHERE ta.student_id=? ORDER BY ta.scanned_at DESC LIMIT 50`,
        [student.id])
      transport = t
    } catch {}

    res.json({
      school: {
        records: school,
        summary: {
          present: pres.c, total: tot.c,
          percentage: tot.c > 0 ? Math.round((pres.c / tot.c) * 100) : 0,
        },
      },
      transport,
    })
  } catch (err) { next(err) }
})

// ── GET /api/parent/notifications ─────────────────────────────────────────────
// all notifications for this parent (across their children)
router.get('/notifications', parentAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT n.*, s.name AS student_name FROM notifications n
       LEFT JOIN students s ON s.id = n.student_id
       WHERE n.parent_phone = ? ORDER BY n.created_at DESC LIMIT 100`,
      [req.parent.phone])
    const [[unread]] = await pool.execute(
      'SELECT COUNT(*) c FROM notifications WHERE parent_phone=? AND is_read=0', [req.parent.phone])
    res.json({ notifications: rows, unread: unread.c })
  } catch (err) { next(err) }
})

// ── POST /api/parent/notifications/read ───────────────────────────────────────
// mark all (or one) as read
router.post('/notifications/read', parentAuth, async (req, res, next) => {
  try {
    const { id } = req.body
    if (id) await pool.execute('UPDATE notifications SET is_read=1 WHERE id=? AND parent_phone=?', [id, req.parent.phone])
    else    await pool.execute('UPDATE notifications SET is_read=1 WHERE parent_phone=?', [req.parent.phone])
    res.json({ message: 'Marked as read' })
  } catch (err) { next(err) }
})

module.exports = router