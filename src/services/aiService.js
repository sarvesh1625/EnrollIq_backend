/**
 * src/services/aiService.js  (Groq version)
 *
 * Drop-in replacement for the Claude version — same three exported
 * functions, same signatures. aiExamController.js does NOT need to change.
 *
 * Requires:
 *   npm install groq-sdk
 *   GROQ_API_KEY set in your .env  (get one at https://console.groq.com)
 *
 * Model choice matters here — check https://console.groq.com/docs/models
 * before deploying, since Groq's lineup changes frequently and some
 * vision models are marked "preview" (evaluation only, not production).
 * As of writing:
 *   - Text tasks (paper generation, insights): openai/gpt-oss-120b (current)
 *   - Vision tasks (answer sheet OCR+grading): qwen/qwen3.6-27b (current vision)
 *   NOTE (Aug 2026): llama-3.3-70b-versatile and llama-4-maverick were
 *   DEPRECATED and shut down by Groq. Updated to current models above.
 *   Check https://console.groq.com/docs/models before deploying.
 *
 * NOTE: the Groq client is created lazily (getGroq()) instead of at
 * module load time. This means a missing GROQ_API_KEY no longer crashes
 * the whole server on startup — it only throws when an AI feature is
 * actually used, so the rest of the app keeps working.
 */

const Groq = require('groq-sdk')

let _groq = null
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set — AI features are unavailable')
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}

const TEXT_MODEL   = process.env.GROQ_TEXT_MODEL   || 'openai/gpt-oss-120b'
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b'

// Strip stray markdown fences etc, just in case, even though we ask for JSON mode.
function extractJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

/* ── 1. QUESTION PAPER GENERATION ─────────────────────────────── */
async function generateQuestionPaper({ subject, class_name, topics, difficulty = 'Medium', total_marks = 100, question_mix }) {
  const mix = question_mix || 'a mix of MCQ, short answer, and long answer questions'

  const prompt = `You are an experienced school teacher setting an exam paper.

Subject: ${subject}
Class/Grade: ${class_name}
Topics to cover: ${topics}
Difficulty: ${difficulty}
Total marks: ${total_marks}
Question mix: ${mix}

Generate a well-structured question paper. Respond with ONLY valid JSON in exactly this shape:

{
  "questions": [
    {
      "question_number": 1,
      "question_text": "...",
      "question_type": "MCQ" | "Short Answer" | "Long Answer",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."] or null,
      "correct_answer": "...",
      "marks": 5
    }
  ]
}

Make sure the marks across all questions sum to approximately ${total_marks}. Keep language age-appropriate for ${class_name}.`

  const completion = await getGroq().chat.completions.create({
    model: TEXT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
    max_tokens: 4000,
  })

  const parsed = extractJSON(completion.choices[0].message.content)
  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error('AI did not return a valid question list')
  }
  return parsed.questions
}

/* ── 2. ANSWER SHEET GRADING (vision OCR + grading) ───────────── */
async function gradeAnswerSheet({ imageBase64, mediaType, questions, maxMarks }) {
  const questionList = questions
    .map(q => `Q${q.question_number} (${q.marks} marks): ${q.question_text}${q.correct_answer ? `\n   Expected answer: ${q.correct_answer}` : ''}`)
    .join('\n\n')

  const prompt = `You are grading a scanned student answer sheet. Read the handwritten/typed answers in the image and grade them against the question paper below.

QUESTION PAPER:
${questionList}

For each question, extract what the student wrote, compare it to the expected answer, and award partial credit fairly based on correctness and completeness — not just exact wording match.

Respond with ONLY valid JSON in exactly this shape:

{
  "total_marks_awarded": 0,
  "max_marks": ${maxMarks},
  "overall_feedback": "2-3 sentence summary of performance",
  "questions": [
    {
      "question_number": 1,
      "extracted_answer": "what the student wrote, transcribed",
      "marks_awarded": 4,
      "max_marks": 5,
      "reasoning": "why this score was given"
    }
  ]
}`

  const completion = await getGroq().chat.completions.create({
    model: VISION_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
      ],
    }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 4000,
  })

  return extractJSON(completion.choices[0].message.content)
}

/* ── 2b. TEXT ANSWER GRADING (typed answers, no image) ────────── */
async function gradeTextAnswers({ questions, answers, maxMarks }) {
  // answers: { [question_number]: "typed answer text" }
  const qa = questions.map(q => {
    const studentAns = answers[q.question_number] ?? answers[String(q.question_number)] ?? '(no answer)'
    return `Q${q.question_number} (${q.marks} marks): ${q.question_text}${q.correct_answer ? `\n   Expected answer: ${q.correct_answer}` : ''}\n   Student's answer: ${studentAns}`
  }).join('\n\n')

  const prompt = `You are grading a student's typed exam answers against the question paper. Award partial credit fairly based on correctness and completeness — not exact wording.

${qa}

Respond with ONLY valid JSON in exactly this shape:

{
  "total_marks_awarded": 0,
  "max_marks": ${maxMarks},
  "overall_feedback": "2-3 sentence summary of performance",
  "questions": [
    {
      "question_number": 1,
      "extracted_answer": "the student's answer",
      "marks_awarded": 4,
      "max_marks": 5,
      "reasoning": "why this score was given"
    }
  ]
}`

  const completion = await getGroq().chat.completions.create({
    model: TEXT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 4000,
  })
  return extractJSON(completion.choices[0].message.content)
}

/* ── 3. REPORT CARD INSIGHTS ──────────────────────────────────── */
async function generateInsights({ student_name, class_name, current_marks, history }) {
  const currentSummary = current_marks
    .map(m => `${m.subject_name}: ${m.marks}/${m.max_marks} (${((m.marks / m.max_marks) * 100).toFixed(0)}%)`)
    .join(', ')

  const historySummary = history.length
    ? history.map(h => `${h.exam_name}: ${h.percentage}%`).join(', ')
    : 'No prior exam history available.'

  const prompt = `You are a school academic counselor reviewing a student's exam performance.

Student: ${student_name}, ${class_name}
Current exam marks: ${currentSummary}
Past exam trend: ${historySummary}

Analyze this and respond with ONLY valid JSON in exactly this shape:

{
  "summary": "2-3 sentence plain-language summary for a parent/teacher",
  "weak_subjects": ["Subject A", "Subject B"],
  "strong_subjects": ["Subject C"],
  "trend": "Improving" | "Declining" | "Stable",
  "alert_level": "None" | "Watch" | "Urgent"
}

Use "Urgent" only if a subject is failing (below 35%) or there's a sharp, consistent decline. Use "Watch" for a single weak subject or early signs of decline.`

  const completion = await getGroq().chat.completions.create({
    model: TEXT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 1000,
  })

  return extractJSON(completion.choices[0].message.content)
}

module.exports = { generateQuestionPaper, gradeAnswerSheet, gradeTextAnswers, generateInsights }