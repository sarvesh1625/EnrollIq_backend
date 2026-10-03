/**
 * EnrollIQ — Chairman Assistant (read-only, whole-GROUP knowledge)
 * Save as:  src/controllers/groupAssistantController.js
 *
 * Same idea as assistantController.js, but for a chairman: instead of one
 * school, it can see every branch in their group. Reuses the exact same
 * per-topic SELECT-only gatherers (imported from assistantController.js)
 * so there is only one place that actually queries each module's data —
 * this file only decides WHICH branch(es) to gather for for a chairman's
 * question, then hands the same JSON shape to Groq.
 *
 * - If the question names a branch, only that branch's data is gathered.
 * - Otherwise, every branch is gathered (one small set of queries each)
 *   so the chairman can ask cross-branch questions like "which branch
 *   has the most pending fees?".
 * - A student name in the question is searched across ALL branches.
 */
const { pool } = require('../db/pool')
const { resolveFeatures } = require('./featuresController')
const { branchesForUser } = require('./groupDashboardController')
const {
  getActiveYear, gLeadsAdmissions, gStudents, gFees, gStaff, gTransport,
  gExams, gAttendance, gCommunication, gStudentByName,
  detectTopics, extractStudentName, callGroq,
} = require('./assistantController')

// Find a branch the question is clearly talking about, by name or city.
// Only matches on whole words of reasonable length, so "Tejaswi" alone
// (shared by every branch) never accidentally narrows to one branch.
function findNamedBranch(question, branches) {
  const q = question.toLowerCase()
  for (const b of branches) {
    if (q.includes(b.name.toLowerCase())) return b
    if (b.city && q.includes(b.city.toLowerCase())) return b
  }
  for (const b of branches) {
    const distinctiveWords = b.name.split(/\s+/).filter(w => w.length > 3)
    if (distinctiveWords.some(w => q.includes(w.toLowerCase()))) return b
  }
  return null
}

async function gatherForBranch(schoolId, topics, studentName, ayId) {
  const ctx = {}
  const safe = async (fn) => { try { return await fn() } catch (e) { console.error('chairman assistant gather error:', e.message); return {} } }
  if (studentName) {
    const matches = await safe(() => gStudentByName(schoolId, studentName))
    if (matches && matches.length) ctx.student_lookup = matches
  }
  if (topics.has('leads'))         Object.assign(ctx, await safe(() => gLeadsAdmissions(schoolId, ayId)))
  if (topics.has('students'))      Object.assign(ctx, await safe(() => gStudents(schoolId)))
  if (topics.has('fees'))          Object.assign(ctx, await safe(() => gFees(schoolId, ayId)))
  if (topics.has('staff'))         Object.assign(ctx, await safe(() => gStaff(schoolId)))
  if (topics.has('transport'))     Object.assign(ctx, await safe(() => gTransport(schoolId)))
  if (topics.has('exams'))         Object.assign(ctx, await safe(() => gExams(schoolId, ayId)))
  if (topics.has('attendance'))    Object.assign(ctx, await safe(() => gAttendance(schoolId, ayId)))
  if (topics.has('communication')) Object.assign(ctx, await safe(() => gCommunication(schoolId)))
  return ctx
}

async function ask(req, res, next) {
  try {
    // feature gate, checked against the chairman's own home branch (their group is
    // enterprise-only anyway, since only enterprise groups have multiple branches)
    try {
      const { features } = await resolveFeatures(req.user.home_school_id || req.user.school_id)
      if (!features.ai_assistant)
        return res.status(403).json({ message: 'The AI Assistant is not included in your current plan.', gated: true })
    } catch { /* fail open if the features table isn't set up yet */ }

    const question = (req.body.question || '').trim()
    if (!question) return res.status(400).json({ message: 'question is required' })

    const branches = await branchesForUser(req.user.id)
    if (!branches.length) return res.json({ answer: "I couldn't find any branches on your account." })

    const ay = await getActiveYear()
    const ayId = ay ? ay.id : null

    const namedBranch = findNamedBranch(question, branches)

    // extractStudentName's "how is X" / "about X" pattern is happy to match a branch
    // name too (e.g. "How is Kazipet doing?"), which would wrongly turn a branch
    // question into a (failed) student search instead of gathering leads/fees/etc.
    // If the extracted "name" actually contains the matched branch's own name, treat
    // it as not a student query at all.
    let studentName = extractStudentName(question)
    if (namedBranch && studentName) {
      const distinctiveWords = namedBranch.name.split(/\s+/).filter(w => w.length > 3).map(w => w.toLowerCase())
      if (distinctiveWords.some(w => studentName.toLowerCase().includes(w))) studentName = null
    }

    let topics = detectTopics(question)
    if (topics.size === 0 && !studentName) topics = new Set(['leads', 'students', 'fees'])

    const context = { academic_year: ay ? ay.name : 'n/a', group_branches: branches.map(b => b.name) }

    if (namedBranch) {
      context.branch = namedBranch.name
      Object.assign(context, await gatherForBranch(namedBranch.id, topics, studentName, ayId))
    } else {
      context.per_branch = {}
      for (const b of branches) context.per_branch[b.name] = await gatherForBranch(b.id, topics, studentName, ayId)
    }

    const system = [
      'You are the EnrollIQ Chairman Assistant — a READ-ONLY assistant for a school GROUP chairman who oversees multiple branches.',
      'Answer ONLY from the DATA provided in JSON. Never invent numbers or facts.',
      'If a value is 0, or data for a branch is missing/empty, say so plainly and honestly.',
      'When comparing branches or giving a group-wide answer, be clear about which branch each number belongs to.',
      'Be concise and clear. Use the ₹ symbol for money.',
      'You cannot change any data — you only report what is in the database.',
    ].join(' ')

    const user = [
      `Chairman question: "${question}"`,
      `DATA (JSON): ${JSON.stringify(context)}`,
      'Answer using ONLY this data.',
    ].join('\n')

    const answer = await callGroq(system, user)
    res.json({ answer, branch: namedBranch ? namedBranch.name : null })
  } catch (err) {
    if (String(err.message).includes('Groq')) {
      return res.status(200).json({ answer: 'The AI service is temporarily unavailable. Please try again shortly.', error: true })
    }
    next(err)
  }
}

module.exports = { ask }