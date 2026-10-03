/**
 * EnrollIQ — School posters controller (admin side)
 * ---------------------------------------------------------------
 * Save as:  src/controllers/postsController.js
 *
 * The poster image is drawn in the admin's browser (posterEngine.js) and
 * uploaded here as a PNG. We store it on Cloudinary, save a row in
 * school_posts, and — when published — drop a notification into every
 * target parent's existing notification list.
 */
const { pool } = require('../db/pool')
const { uploadBuffer, isConfigured, cloudinary } = require('../services/cloudinaryService')
const { generatePosterText } = require('../services/posterAiService')
const imageAi = require('../services/posterImageService')

const HEX = /^#[0-9a-fA-F]{6}$/

function normaliseClasses(v) {
  if (!v || v === 'all') return null
  const list = (Array.isArray(v) ? v : String(v).split(','))
    .map(s => String(s).trim()).filter(Boolean)
  return list.length ? list.join(',') : null
}

/* ───────── brand settings (logo, colour, principal, tagline) ───────── */

// GET /api/posts/settings
async function getSettings(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[school]] = await pool.execute('SELECT name FROM schools WHERE id=?', [schoolId])
    const [[s]] = await pool.execute('SELECT * FROM school_poster_settings WHERE school_id=?', [schoolId])
    res.json({
      school_name: school?.name || '',
      logo_url: s?.logo_url || null,
      brand_color: s?.brand_color || '#4f46e5',
      principal_name: s?.principal_name || '',
      tagline: s?.tagline || '',
    })
  } catch (e) { next(e) }
}

// PUT /api/posts/settings
async function saveSettings(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { brand_color, principal_name, tagline } = req.body
    const color = HEX.test(brand_color || '') ? brand_color : '#4f46e5'
    await pool.execute(
      `INSERT INTO school_poster_settings (school_id, brand_color, principal_name, tagline)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE brand_color=VALUES(brand_color), principal_name=VALUES(principal_name), tagline=VALUES(tagline)`,
      [schoolId, color, (principal_name || '').trim().slice(0, 150) || null, (tagline || '').trim().slice(0, 200) || null])
    res.json({ message: 'Saved' })
  } catch (e) { next(e) }
}

// POST /api/posts/logo  (multipart, field "logo")
async function uploadLogo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a logo image' })
    if (!isConfigured()) return res.status(500).json({ message: 'File storage (Cloudinary) is not configured on the server.' })
    const schoolId = req.user.school_id

    const [[old]] = await pool.execute('SELECT logo_public_id FROM school_poster_settings WHERE school_id=?', [schoolId])
    const up = await uploadBuffer(req.file.buffer, `enrolliq/brand/${schoolId}`, `logo-${Date.now()}`)
    await pool.execute(
      `INSERT INTO school_poster_settings (school_id, logo_url, logo_public_id) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE logo_url=VALUES(logo_url), logo_public_id=VALUES(logo_public_id)`,
      [schoolId, up.url, up.public_id])
    if (old?.logo_public_id) cloudinary.uploader.destroy(old.logo_public_id).catch(() => {})
    res.json({ logo_url: up.url })
  } catch (e) { next(e) }
}

/* ───────── helpers ───────── */

// GET /api/posts/classes — classes that actually have active students (for "send to" picker)
async function listClasses(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT class FROM students WHERE school_id=? AND status='Active' AND class IS NOT NULL AND class<>'' ORDER BY class`,
      [req.user.school_id])
    res.json(rows.map(r => r.class))
  } catch (e) { next(e) }
}

// POST /api/posts/generate-text
async function generateText(req, res, next) {
  try {
    const { occasion, details, language, tone, date_text } = req.body
    const [[school]] = await pool.execute('SELECT name FROM schools WHERE id=?', [req.user.school_id])
    const out = await generatePosterText({
      occasion: String(occasion || '').slice(0, 120),
      details: String(details || '').slice(0, 800),
      language, tone,
      schoolName: school?.name,
      dateText: String(date_text || '').slice(0, 80),
    })
    res.json(out)
  } catch (e) {
    if (e.status === 503) return res.status(503).json({ message: e.message })
    console.error('generate-text failed:', e.message)
    res.status(502).json({ message: 'The AI could not write this right now — please try again, or type the text yourself.' })
  }
}

// Tell the right parents (bulk insert into the existing notifications table)
async function notifyParents(post, schoolId) {
  try {
    const classes = post.target_classes ? post.target_classes.split(',') : null
    const [rows] = classes
      ? await pool.query(
          `SELECT DISTINCT parent_phone FROM students
           WHERE school_id=? AND status='Active' AND parent_phone IS NOT NULL AND parent_phone<>'' AND class IN (?)`,
          [schoolId, classes])
      : await pool.query(
          `SELECT DISTINCT parent_phone FROM students
           WHERE school_id=? AND status='Active' AND parent_phone IS NOT NULL AND parent_phone<>''`,
          [schoolId])
    if (!rows.length) return 0

    const body = (post.caption || '').replace(/\s+/g, ' ').slice(0, 140) || null
    const link = `posts:${post.id}`
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map(r => [schoolId, null, r.parent_phone, 'announcement', post.title.slice(0, 200), body, link])
      await pool.query(
        'INSERT INTO notifications (school_id, student_id, parent_phone, type, title, body, link) VALUES ?', [chunk])
    }
    return rows.length
  } catch (e) { console.error('notify parents failed:', e.message); return 0 }
}

async function removeNotifications(postId, schoolId) {
  try { await pool.execute('DELETE FROM notifications WHERE school_id=? AND link=?', [schoolId, `posts:${postId}`]) } catch {}
}

/* ───────── posts CRUD ───────── */

// POST /api/posts  (multipart: image + fields)
async function createPost(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const { title, caption, template_key, event_date, status, target_classes } = req.body
    if (!title || !title.trim()) return res.status(400).json({ message: 'A title is required' })
    if (!req.file) return res.status(400).json({ message: 'The poster image is missing' })
    if (!isConfigured()) return res.status(500).json({ message: 'File storage (Cloudinary) is not configured on the server.' })

    const up = await uploadBuffer(req.file.buffer, `enrolliq/posts/${schoolId}`, `post-${Date.now()}`)
    const publish = status === 'published'

    const [r] = await pool.execute(
      `INSERT INTO school_posts
         (school_id, created_by, template_key, title, caption, image_url, image_public_id, event_date, target_classes, status, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,${publish ? 'NOW()' : 'NULL'})`,
      [schoolId, req.user.id, (template_key || 'announcement').slice(0, 30), title.trim().slice(0, 200),
       (caption || '').trim() || null, up.url, up.public_id,
       event_date || null, normaliseClasses(target_classes), publish ? 'published' : 'draft'])

    const [[post]] = await pool.execute('SELECT * FROM school_posts WHERE id=?', [r.insertId])
    let notified = 0
    if (publish) notified = await notifyParents(post, schoolId)
    res.status(201).json({ ...post, notified })
  } catch (e) { next(e) }
}

// GET /api/posts
async function listPosts(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM school_posts WHERE school_id=? ORDER BY COALESCE(published_at, created_at) DESC LIMIT 100`,
      [req.user.school_id])
    res.json(rows)
  } catch (e) { next(e) }
}

// PATCH /api/posts/:id  — edit text, or publish / unpublish
async function updatePost(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[post]] = await pool.execute('SELECT * FROM school_posts WHERE id=? AND school_id=?', [req.params.id, schoolId])
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const { title, caption, status, target_classes } = req.body
    const fields = [], params = []
    if (title !== undefined)   { if (!String(title).trim()) return res.status(400).json({ message: 'Title cannot be empty' }); fields.push('title=?'); params.push(String(title).trim().slice(0, 200)) }
    if (caption !== undefined) { fields.push('caption=?'); params.push(String(caption).trim() || null) }
    if (target_classes !== undefined) { fields.push('target_classes=?'); params.push(normaliseClasses(target_classes)) }

    let newlyPublished = false, unpublished = false
    if (status && status !== post.status && ['draft', 'published'].includes(status)) {
      fields.push('status=?'); params.push(status)
      if (status === 'published') { fields.push('published_at=NOW()'); newlyPublished = true }
      else unpublished = true
    }
    if (!fields.length) return res.status(400).json({ message: 'Nothing to update' })

    await pool.execute(`UPDATE school_posts SET ${fields.join(', ')} WHERE id=?`, [...params, post.id])
    const [[fresh]] = await pool.execute('SELECT * FROM school_posts WHERE id=?', [post.id])
    let notified = 0
    if (newlyPublished) notified = await notifyParents(fresh, schoolId)
    if (unpublished) await removeNotifications(post.id, schoolId)
    res.json({ ...fresh, notified })
  } catch (e) { next(e) }
}

// DELETE /api/posts/:id
async function deletePost(req, res, next) {
  try {
    const schoolId = req.user.school_id
    const [[post]] = await pool.execute('SELECT * FROM school_posts WHERE id=? AND school_id=?', [req.params.id, schoolId])
    if (!post) return res.status(404).json({ message: 'Post not found' })
    await pool.execute('DELETE FROM school_posts WHERE id=?', [post.id])
    await removeNotifications(post.id, schoolId)
    if (post.image_public_id) cloudinary.uploader.destroy(post.image_public_id).catch(() => {})
    res.json({ message: 'Deleted' })
  } catch (e) { next(e) }
}

/* ───────── AI backgrounds (optional, off until the image service is configured) ───────── */

const noTable = e => e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)

async function usedToday(schoolId) {
  const [[row]] = await pool.execute('SELECT used FROM poster_bg_usage WHERE school_id=? AND usage_date=CURDATE()', [schoolId])
  return row ? row.used : 0
}
// Reserve one generation atomically: two clicks at once can never both take the last slot.
async function reserve(schoolId, limit) {
  await pool.execute('INSERT IGNORE INTO poster_bg_usage (school_id, usage_date, used) VALUES (?, CURDATE(), 0)', [schoolId])
  const [r] = await pool.execute('UPDATE poster_bg_usage SET used = used + 1 WHERE school_id=? AND usage_date=CURDATE() AND used < ?', [schoolId, limit])
  return r.affectedRows === 1
}
const refund = schoolId =>
  pool.execute('UPDATE poster_bg_usage SET used = GREATEST(used - 1, 0) WHERE school_id=? AND usage_date=CURDATE()', [schoolId])

// GET /api/posts/ai-status — lets the page show the right state before anyone clicks
async function aiStatus(req, res, next) {
  try {
    const limit = imageAi.dailyLimit()
    const configured = imageAi.isConfigured()
    let used = 0, needs_migration = false
    if (configured) {
      try { used = await usedToday(req.user.school_id) } catch (e) { if (noTable(e)) needs_migration = true; else throw e }
    }
    res.json({ configured, limit, used, remaining: Math.max(0, limit - used), needs_migration })
  } catch (e) { next(e) }
}

// POST /api/posts/generate-background  { occasion, theme }
async function generateBackground(req, res, next) {
  const schoolId = req.user.school_id
  try {
    if (!imageAi.isConfigured())
      return res.status(503).json({ code: 'not_configured', message: 'AI backgrounds are not switched on yet. Ask your developer to add the image service key.' })
    const theme = String(req.body.theme || '').trim()
    if (theme.length < 3)
      return res.status(400).json({ code: 'no_theme', message: 'Describe the background you want, in a few words.' })

    const limit = imageAi.dailyLimit()
    let ok
    try { ok = await reserve(schoolId, limit) }
    catch (e) {
      if (noTable(e)) return res.status(503).json({ code: 'needs_migration', message: 'AI backgrounds need one database step first. Ask your developer to run migrate_poster_ai_images.js.' })
      throw e
    }
    if (!ok)
      return res.status(429).json({ code: 'daily_limit', message: `Daily limit reached (${limit} AI backgrounds per day). Try again tomorrow, or use one of the built-in designs.` })

    try {
      const { buffer, mime } = await imageAi.generateBackground({ occasion: req.body.occasion, theme })
      const used = await usedToday(schoolId)
      return res.json({ image: `data:${mime};base64,${buffer.toString('base64')}`, remaining: Math.max(0, limit - used), limit })
    } catch (e) {
      await refund(schoolId).catch(() => {})        // a failed attempt doesn't use up a slot
      if (e.status && e.code) return res.status(e.status).json({ code: e.code, message: e.message })
      throw e
    }
  } catch (e) { next(e) }
}

module.exports = { getSettings, saveSettings, uploadLogo, listClasses, generateText, aiStatus, generateBackground, createPost, listPosts, updatePost, deletePost }