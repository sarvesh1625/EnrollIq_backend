const router = require('express').Router()
const { protect } = require('../middleware/auth')
const { pool } = require('../db/pool')

// GET /api/schools/my — current school's full profile
router.get('/my', protect, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM schools WHERE id=?', [req.user.school_id])
    if (!rows.length) return res.status(404).json({ message: 'School not found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// GET /api/schools
router.get('/', protect, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM schools WHERE id=?', [req.user.school_id])
    res.json(rows[0] || {})
  } catch (err) { next(err) }
})

// PUT /api/schools
router.put('/', protect, async (req, res, next) => {
  try {
    const { name, city, board, phone } = req.body
    await pool.execute(
      'UPDATE schools SET name=COALESCE(?,name), city=COALESCE(?,city), board=COALESCE(?,board), phone=COALESCE(?,phone) WHERE id=?',
      [name||null, city||null, board||null, phone||null, req.user.school_id]
    )
    res.json({ message: 'Updated' })
  } catch (err) { next(err) }
})

module.exports = router