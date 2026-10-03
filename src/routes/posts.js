/**
 * EnrollIQ — School posters (admin side)
 * Save as:  src/routes/posts.js      Mount:  app.use('/api/posts', require('./routes/posts'))
 */
const router = require('express').Router()
const multer = require('multer')
const { protect, requireAdmin } = require('../middleware/auth')
const ctrl = require('../controllers/postsController')

const imageOnly = (req, file, cb) =>
  /^image\/(png|jpe?g|webp)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(Object.assign(new Error('Only PNG, JPG or WebP images are allowed'), { status: 400 }))

const uploadPoster = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: imageOnly })
const uploadLogo   = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 }, fileFilter: imageOnly })

router.use(protect, requireAdmin)

// static paths first, dynamic '/:id' last
router.get ('/settings',      ctrl.getSettings)
router.put ('/settings',      ctrl.saveSettings)
router.post('/logo',          uploadLogo.single('logo'), ctrl.uploadLogo)
router.get ('/classes',       ctrl.listClasses)
router.post('/generate-text', ctrl.generateText)
router.get ('/ai-status',      ctrl.aiStatus)
router.post('/generate-background', ctrl.generateBackground)
router.get ('/',              ctrl.listPosts)
router.post('/',              uploadPoster.single('image'), ctrl.createPost)
router.patch ('/:id',         ctrl.updatePost)
router.delete('/:id',         ctrl.deletePost)

module.exports = router