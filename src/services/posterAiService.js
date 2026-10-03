/**
 * EnrollIQ — Poster text writer (AI)
 * ---------------------------------------------------------------
 * Save as:  src/services/posterAiService.js
 *
 * The AI's only job here is WORDS: a short poster headline, a one-line
 * message for the poster, and a friendly caption for the parent app.
 * It never draws the poster (the poster engine does that), so names,
 * dates and spelling on the poster are always exactly what staff typed.
 *
 * Uses the same Groq setup as aiService.js (GROQ_API_KEY, GROQ_TEXT_MODEL).
 */
const Groq = require('groq-sdk')

let _groq = null
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      const e = new Error('AI writing is not configured on the server (GROQ_API_KEY missing).')
      e.status = 503
      throw e
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}

const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b'

const LANGUAGES = {
  en: 'English',
  hi: 'Hindi (write in Devanagari script)',
  te: 'Telugu (write in Telugu script)',
}
const TONES = {
  warm:   'warm, caring and friendly',
  formal: 'formal, clear and professional',
  joyful: 'joyful, energetic and celebratory',
}

function extractJSON(text) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}')
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned)
}
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max)
const noEmoji = s => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim()

/**
 * @param {object} p
 * @param {string} p.occasion   e.g. "Diwali", "Holiday Notice", "Annual Day Celebration"
 * @param {string} p.details    anything staff typed: dates, timings, what to bring…
 * @param {string} p.language   'en' | 'hi' | 'te'
 * @param {string} p.tone       'warm' | 'formal' | 'joyful'
 * @param {string} p.schoolName
 * @param {string} p.dateText   optional, already-formatted date/time shown on the poster
 */
async function generatePosterText({ occasion, details, language = 'en', tone = 'warm', schoolName, dateText }) {
  const lang = LANGUAGES[language] || LANGUAGES.en
  const toneText = TONES[tone] || TONES.warm

  const prompt = `You write short messages for an Indian school to send to parents.

OCCASION: ${occasion || 'School announcement'}
SCHOOL: ${schoolName || 'the school'}
DATE / TIME TO SHOW (if any): ${dateText || 'none'}
EXTRA DETAILS FROM THE SCHOOL: ${details ? details : 'none'}
LANGUAGE: ${lang}
TONE: ${toneText}

Write three things, all in ${lang}:
1. "headline": the big text on the poster. At most 5 words. No emojis, no quotation marks, no full stop.
2. "subline": one short supporting message shown on the poster. At most 22 words. No emojis.
3. "caption": the message parents read in the app. 2 to 4 short sentences, ${toneText}. You may use 1 to 3 fitting emojis. End with the school name.

STRICT RULES:
- Use ONLY the facts given above. Never invent dates, times, venues, names, chief guests, fees or phone numbers.
- If it is a holiday or closure notice, say clearly that the school is closed, and mention the date only if it was given.
- If no details are given, write a genuine, general greeting for the occasion.
- Keep it respectful and suitable for every religion and community. No hashtags.

Reply with ONLY valid JSON in exactly this shape:
{"headline":"...","subline":"...","caption":"..."}`

  const completion = await getGroq().chat.completions.create({
    model: TEXT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 700,
  })

  const parsed = extractJSON(completion.choices[0].message.content)
  const out = {
    headline: noEmoji(clean(parsed.headline, 70)),
    subline:  noEmoji(clean(parsed.subline, 200)),
    caption:  clean(parsed.caption, 700),
  }
  if (!out.headline || !out.caption) throw new Error('AI did not return usable text — please try again')
  return out
}

module.exports = { generatePosterText, LANGUAGES, TONES }