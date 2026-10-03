/**
 * EnrollIQ — School posters (parent app feed)
 * Save as:  src/routes/parentPosts.js
 * Mount:    app.use('/api/parent/posts', require('./routes/parentPosts'))
 *           (put it just BEFORE the app.use('/api/parent', parentRouter) line)
 *
 * A parent sees every published post from the school(s) their children attend —
 * either sent to everyone, or sent to a class one of their children is in.
 */
const router = require('express').Router()
const jwt    = require('jsonwebtoken')
const { pool } = require('../db/pool')

// same check as routes/parent.js (kept local so parent.js doesn't need editing)
function parentAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'parent') return res.status(403).json({ message: 'Not authorized' })
    req.parent = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Session expired. Please login again.' })
  }
}

// GET /api/parent/posts?limit=20&offset=0
router.get('/', parentAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50)
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)
    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.caption, p.image_url, p.template_key, p.event_date, p.published_at,
              sc.name AS school_name
       FROM school_posts p
       JOIN schools sc ON sc.id = p.school_id
       WHERE p.status = 'published'
         AND EXISTS (
           SELECT 1 FROM students s
           WHERE s.parent_phone = ? AND s.school_id = p.school_id AND s.status = 'Active'
             AND (p.target_classes IS NULL OR FIND_IN_SET(s.class, p.target_classes) > 0)
         )
       ORDER BY p.published_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [req.parent.phone, limit, offset])
    res.json({ posts: rows, has_more: rows.length === limit })
  } catch (e) { next(e) }
})

module.exports = router