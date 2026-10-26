/**
 * EnrollIQ — grade a MULTI-PAGE answer sheet (1 to 20 page photos)
 * Save as:  backend/src/services/multiPageGrading.js
 *
 * Why two steps: a vision model can only look at a few images per request, and a 15-page
 * answer would not fit in one call. So:
 *   1. Read the pages in small batches (3 pages per call, a few calls at once) and write out
 *      what the student wrote, page by page.
 *   2. Give the AI the whole transcript + the question paper and grade it in ONE pass, so an
 *      answer that runs across several pages, or answers written out of order, is still matched.
 * A single page keeps using the original one-step grader (no change in behaviour).
 */
const Groq = require('groq-sdk')
const { gradeAnswerSheet } = require('./aiService')

let _groq = null
function groq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set — AI features are unavailable')
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}
const TEXT_MODEL   = process.env.GROQ_TEXT_MODEL   || 'openai/gpt-oss-120b'
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b'

const PAGES_PER_CALL = 3
const CONCURRENCY    = 3

const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
function extractJSON(text) {
  return JSON.parse(String(text).replace(/```json/gi, '').replace(/```/g, '').trim())
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function transcribeBatch(batch, firstPageNo) {
  const last = firstPageNo + batch.length - 1
  const prompt = `These are page${batch.length > 1 ? 's' : ''} ${firstPageNo}${batch.length > 1 ? ` to ${last}` : ''} of ONE student's handwritten exam answer sheet, in order.
Transcribe everything the student wrote, exactly as written, page by page.
- Begin each page with a line:  === PAGE n ===   (use the real page numbers ${firstPageNo}-${last}).
- Keep question numbers / labels exactly as the student wrote them (Q1, 2., Ans 3, etc.).
- Write [unclear] for words you cannot read. Skip crossed-out text and rough work.
- Do NOT grade, correct or comment. Output plain text only.`

  const content = [{ type: 'text', text: prompt },
    ...batch.map(p => ({ type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}` } }))]

  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const c = await groq().chat.completions.create({
        model: VISION_MODEL, messages: [{ role: 'user', content }], temperature: 0, max_tokens: 4000,
      })
      const text = stripThink(c.choices[0].message.content)
      if (text) return text
      lastErr = new Error('empty transcript')
    } catch (e) { lastErr = e; if (e.status === 429) break }
  }
  const err = new Error(`Could not read page${batch.length > 1 ? 's' : ''} ${firstPageNo}${batch.length > 1 ? `-${last}` : ''} (${lastErr?.message || 'unknown error'}).`)
  err.status = lastErr?.status
  err.pageError = true
  throw err
}

/**
 * pages: [{ base64, mediaType }] in the order the student wrote them
 * returns the same shape as gradeAnswerSheet(), plus { transcript, pages }
 */
async function gradeAnswerSheetPages({ pages, questions, maxMarks }) {
  if (pages.length === 1) {
    const r = await gradeAnswerSheet({ imageBase64: pages[0].base64, mediaType: pages[0].mediaType, questions, maxMarks })
    return { ...r, pages: 1 }
  }

  const batches = []
  for (let i = 0; i < pages.length; i += PAGES_PER_CALL) batches.push({ pages: pages.slice(i, i + PAGES_PER_CALL), first: i + 1 })
  const parts = await mapLimit(batches, CONCURRENCY, b => transcribeBatch(b.pages, b.first))
  const transcript = parts.join('\n\n')

  const questionList = questions
    .map(q => `Q${q.question_number} (${q.marks} marks): ${q.question_text}${q.correct_answer ? `\n   Expected answer: ${q.correct_answer}` : ''}`)
    .join('\n\n')

  const prompt = `You are grading a student's handwritten answer sheet that ran to ${pages.length} pages. Below is a transcript of all pages, in order, followed by the question paper.

Rules:
- An answer may continue across several pages, and the student may answer questions out of order. Match each answer to its question using the question number the student wrote; if there is none, use the content.
- Ignore rough work and crossed-out text. If a question has no answer, give 0 marks and say "Not attempted".
- Award partial credit fairly for correctness and completeness, not exact wording. Never award more than the question's marks.

QUESTION PAPER:
${questionList}

STUDENT TRANSCRIPT:
${transcript}

Respond with ONLY valid JSON in exactly this shape:
{
  "total_marks_awarded": 0,
  "max_marks": ${maxMarks},
  "overall_feedback": "2-3 sentence summary of performance",
  "questions": [
    { "question_number": 1, "extracted_answer": "what the student wrote, short", "marks_awarded": 4, "max_marks": 5, "reasoning": "why this score" }
  ]
}`

  const c = await groq().chat.completions.create({
    model: TEXT_MODEL, messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 6000,
  })
  const result = extractJSON(c.choices[0].message.content)
  if (!Array.isArray(result.questions)) throw new SyntaxError('AI did not return question marks')
  return { ...result, transcript, pages: pages.length }
}

module.exports = { gradeAnswerSheetPages, PAGES_PER_CALL }