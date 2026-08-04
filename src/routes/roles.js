// ═══════════════════════════════════════════════════════════════
// routes/roles.js — Staff & Teacher onboarding routes
// Wire in server.js:   app.use('/api/roles', require('./routes/roles'))
// Also add in server.js (for serving uploaded documents):
//   app.use('/uploads', express.static('uploads'))
// Requires: npm i multer
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router()
const path   = require('path')
const fs     = require('fs')
const multer = require('multer')
const { protect, requireAdmin } = require('../middleware/auth')
const ctrl   = require('../controllers/rolesController')

// ── Multer storage for staff documents ──────────────────────────
const DOC_DIR = path.join(process.cwd(), 'uploads', 'staff-docs')
fs.mkdirSync(DOC_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOC_DIR),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    cb(null, `${req.params.id}_${Date.now()}_${safe}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.originalname)
    cb(ok ? null : new Error('Only PDF / JPG / PNG files allowed'), ok)
  },
})

// All routes are admin-only
router.use(protect, requireAdmin)

router.get   ('/users',                    ctrl.listUsers)
router.post  ('/users',                    ctrl.createUser)
router.get   ('/users/:id',                ctrl.getUser)
router.put   ('/users/:id',                ctrl.updateUser)
router.delete('/users/:id',                ctrl.deleteUser)
router.post  ('/users/:id/reset-password', ctrl.resetPassword)

router.post  ('/users/:id/documents',      upload.single('file'), ctrl.uploadDocument)
router.put   ('/documents/:docId/verify',  ctrl.verifyDocument)
router.delete('/documents/:docId',         ctrl.deleteDocument)

module.exports = router