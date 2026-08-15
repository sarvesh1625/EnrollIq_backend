const router = require('express').Router()
const multer = require('multer')
const { protect } = require('../middleware/auth')
const { createPost, listPosts, deletePost } = require('../controllers/diaryController')

// accept up to 5 files (images, PDFs, any) up to 10MB each, in memory for Cloudinary
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.get('/',       protect, listPosts)
router.post('/',      protect, upload.array('files', 5), createPost)
router.delete('/:id', protect, deletePost)

module.exports = router