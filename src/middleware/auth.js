const jwt  = require('jsonwebtoken')
const { pool } = require('../db/pool')

async function protect(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token provided' })

  const token = auth.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const [rows]  = await pool.execute(
      'SELECT id, school_id, name, email, role FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    )
    if (!rows.length) return res.status(401).json({ message: 'User not found or deactivated' })
    req.user = rows[0]
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' })
  next()
}

module.exports = { protect, requireAdmin }