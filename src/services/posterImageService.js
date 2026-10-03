/**
 * EnrollIQ — AI background images for posters
 * ---------------------------------------------------------------------
 * Save as:  src/services/posterImageService.js
 *
 * The AI draws ONLY a decorative background. It never draws words — the
 * poster engine puts the school name, logo, headline and date on top, so
 * spelling (including Telugu / Hindi) is always exactly what staff typed.
 *
 * SWITCHED OFF BY DEFAULT. Turn it on by setting, in the server .env:
 *   IMAGE_API_KEY   the key from your image provider
 *   IMAGE_MODEL     the provider's model name (check their docs — names change)
 * Optional:
 *   IMAGE_API_URL   default https://api.openai.com/v1/images/generations
 *                   (any provider that accepts the same request shape works)
 *   IMAGE_SIZE      default 1024x1536 (portrait; the poster crops it to fit)
 *   IMAGE_TIMEOUT_MS default 90000
 *   IMAGE_EXTRA_JSON extra provider-specific fields, e.g. {"quality":"medium"}
 *   POSTER_AI_IMAGE_DAILY_LIMIT  per school per day, default 10
 *
 * To use a provider whose API has a different shape, only callProvider()
 * below needs changing — nothing else in the app knows about the provider.
 */

const DEFAULT_URL = 'https://api.openai.com/v1/images/generations'
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

function fail(status, code, message) {
  const e = new Error(message); e.status = status; e.code = code; return e
}

function parseExtra() {
  try {
    const v = JSON.parse(process.env.IMAGE_EXTRA_JSON || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { console.error('IMAGE_EXTRA_JSON is not valid JSON — ignoring it'); return {} }
}

function config() {
  return {
    key: (process.env.IMAGE_API_KEY || '').trim(),
    model: (process.env.IMAGE_MODEL || '').trim(),
    url: (process.env.IMAGE_API_URL || DEFAULT_URL).trim(),
    size: (process.env.IMAGE_SIZE || '1024x1536').trim(),
    timeoutMs: Number(process.env.IMAGE_TIMEOUT_MS) || 90000,
    extra: parseExtra(),
  }
}

const isConfigured = () => { const c = config(); return !!(c.key && c.model) }
const dailyLimit = () => { const n = parseInt(process.env.POSTER_AI_IMAGE_DAILY_LIMIT || '10', 10); return Number.isFinite(n) && n >= 0 ? n : 10 }

/* ───────── the prompt: staff's idea + rules we always add ───────── */
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

function buildPrompt({ occasion, theme }) {
  const o = clean(occasion, 80)
  const t = clean(theme, 240)
  return [
    `Decorative background artwork for a school poster${o ? ` about "${o}"` : ''}.`,
    `Theme requested by the school: ${t || 'a bright, welcoming, festive design'}.`,
    '',
    'Composition: portrait-format illustration. Keep the centre calm and uncluttered, with soft low-detail colour, because a headline and message will be placed over it. Put the decorative details around the edges, corners and bottom.',
    'Style: clean, colourful, modern flat illustration or soft painted style, with rich colours.',
    '',
    'HARD RULES (these override anything in the theme above):',
    '- Do NOT include any text, letters, words, numbers, logos, watermarks or signatures anywhere in the image.',
    '- Do NOT include any people, faces, hands, children or animals.',
    '- Do NOT depict gods, idols or religious figures. Use neutral symbols instead, such as lamps, flowers, stars, kites, patterns, moons or landscapes.',
    '- Suitable for all ages and all communities: no violence, no adult content, no brand names, no political symbols or leaders.',
  ].join('\n')
}

/* ───────── provider call (the only provider-specific code) ───────── */
async function withTimeout(ms, run) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await run(ctrl.signal) } finally { clearTimeout(timer) }
}

function sniffMime(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

async function callProvider(prompt) {
  const c = config()
  const body = { model: c.model, prompt, n: 1, size: c.size, ...c.extra }

  let res
  try {
    res = await withTimeout(c.timeoutMs, signal => fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify(body), signal,
    }))
  } catch (e) {
    if (e.name === 'AbortError') throw fail(504, 'timeout', 'The image service took too long. Please try again.')
    console.error('image provider unreachable:', e.message)
    throw fail(502, 'network', 'Could not reach the image service. Please try again in a moment.')
  }

  const raw = await res.text()
  let json = null; try { json = JSON.parse(raw) } catch { /* not JSON */ }

  if (!res.ok) {
    console.error(`image provider error ${res.status}:`, raw.slice(0, 300).replace(/[A-Za-z0-9_\-]{20,}|sk-[A-Za-z0-9_\-*]+/g, '[redacted]'))
    if (res.status === 401 || res.status === 403) throw fail(503, 'bad_key', 'The image service refused the request. Ask your developer to check IMAGE_API_KEY, and that the account is verified and allowed to use this model (some providers require account verification first).')
    if (res.status === 402) throw fail(503, 'no_credit', 'The image service account is out of credit. Ask your developer to top it up.')
    // some providers (OpenAI) report "out of credit" as a 429 — don't tell staff to just wait in that case
    if (res.status === 429 && /quota|billing|credit|balance/i.test(raw)) throw fail(503, 'no_credit', 'The image service account is out of credit. Ask your developer to top it up.')
    if (res.status === 429) throw fail(429, 'provider_busy', 'The image service is busy right now. Please wait a minute and try again.')
    if (res.status === 400 || res.status === 422) throw fail(422, 'rejected', "The image service couldn't create that. Try describing it differently — avoid people, brands or sensitive topics.")
    throw fail(502, 'provider_error', 'The image service had a problem. Please try again.')
  }

  const item = json && Array.isArray(json.data) ? json.data[0] : null
  let buffer = null
  if (item && item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64')
  } else if (item && item.url) {
    if (!/^https:\/\//i.test(item.url)) throw fail(502, 'bad_response', 'The image service returned an unusable link.')
    try {
      const r = await withTimeout(c.timeoutMs, signal => fetch(item.url, { signal }))
      if (!r.ok) throw new Error('download ' + r.status)
      const len = Number(r.headers.get('content-length') || 0)
      if (len > MAX_IMAGE_BYTES) throw fail(502, 'too_large', 'The image came back too large. Please try again.')
      buffer = Buffer.from(await r.arrayBuffer())
    } catch (e) {
      if (e.code) throw e
      console.error('image download failed:', e.message)
      throw fail(502, 'download', 'Could not download the finished image. Please try again.')
    }
  }
  if (!buffer || !buffer.length) throw fail(502, 'bad_response', 'The image service returned no picture. Please try again.')
  if (buffer.length > MAX_IMAGE_BYTES) throw fail(502, 'too_large', 'The image came back too large. Please try again.')
  const mime = sniffMime(buffer)
  if (!mime) throw fail(502, 'bad_response', 'The image service returned something that is not a picture.')
  return { buffer, mime }
}

async function generateBackground({ occasion, theme }) {
  if (!isConfigured()) throw fail(503, 'not_configured', 'AI backgrounds are not switched on yet. Ask your developer to add the image service key.')
  return callProvider(buildPrompt({ occasion, theme }))
}

module.exports = { isConfigured, dailyLimit, buildPrompt, generateBackground }