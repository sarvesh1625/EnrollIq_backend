/**
 * EnrollIQ — per-school branding (logo)
 * Save as: backend/src/controllers/brandingController.js
 * Each school keeps its own logo. Stored in schools.brand_logo_url (the column is created automatically).
 */
const path   = require('path')
const fs     = require('fs')
const multer = require('multer')
const { pool } = require('../db/pool')

const DIR = path.join(__dirname, '../../uploads/logos')
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }

let ready = null
function ensureColumn() {
  if (!ready) {
    ready = (async () => {
      const [r] = await pool.execute(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'brand_logo_url'`)
      if (!r[0].n) await pool.execute('ALTER TABLE schools ADD COLUMN brand_logo_url VARCHAR(500) NULL')
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

function absUrl(req, rel) {
  if (!rel) return null
  if (/^https?:\/\//i.test(rel)) return rel
  const base = process.env.PUBLIC_API_URL ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`
  return base.replace(/\/$/, '') + rel
}

const canEdit = (u) => ['admin', 'chairman'].includes(u.role)

// GET /api/branding/mine  → { school_id, name, logo_url }   (any signed-in user of the school)
async function mine(req, res, next) {
  try {
    await ensureColumn()
    const [[s]] = await pool.execute('SELECT id, name, brand_logo_url FROM schools WHERE id = ?', [req.user.school_id])
    if (!s) return res.status(404).json({ message: 'School not found' })
    res.json({ school_id: s.id, name: s.name, logo_url: absUrl(req, s.brand_logo_url), can_edit: canEdit(req.user) })
  } catch (err) { next(err) }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(EXT[file.mimetype] ? null : new Error('Use a PNG, JPG or WEBP image'), !!EXT[file.mimetype]),
})

function removeOld(rel) {
  try {
    if (rel && rel.startsWith('/uploads/logos/')) fs.unlinkSync(path.join(DIR, path.basename(rel)))
  } catch {}
}

// POST /api/branding/logo   (multipart, field "logo")   admin / chairman only
function setLogo(req, res, next) {
  if (!canEdit(req.user)) return res.status(403).json({ message: 'Only the school admin can change the logo' })
  upload.single('logo')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' })
    if (!req.file) return res.status(400).json({ message: 'Choose an image first' })
    try {
      await ensureColumn()
      fs.mkdirSync(DIR, { recursive: true })
      const name = `school-${req.user.school_id}-${Date.now()}${EXT[req.file.mimetype]}`
      fs.writeFileSync(path.join(DIR, name), req.file.buffer)
      const [[old]] = await pool.execute('SELECT brand_logo_url FROM schools WHERE id = ?', [req.user.school_id])
      const rel = `/uploads/logos/${name}`
      await pool.execute('UPDATE schools SET brand_logo_url = ? WHERE id = ?', [rel, req.user.school_id])
      removeOld(old?.brand_logo_url)
      res.json({ logo_url: absUrl(req, rel) })
    } catch (e) { next(e) }
  })
}

// DELETE /api/branding/logo
async function clearLogo(req, res, next) {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ message: 'Only the school admin can change the logo' })
    await ensureColumn()
    const [[old]] = await pool.execute('SELECT brand_logo_url FROM schools WHERE id = ?', [req.user.school_id])
    await pool.execute('UPDATE schools SET brand_logo_url = NULL WHERE id = ?', [req.user.school_id])
    removeOld(old?.brand_logo_url)
    res.json({ logo_url: null })
  } catch (err) { next(err) }
}

module.exports = { mine, setLogo, clearLogo }