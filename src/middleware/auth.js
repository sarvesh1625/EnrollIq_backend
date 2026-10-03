const jwt  = require('jsonwebtoken')
const { pool } = require('../db/pool')

async function protect(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token provided' })

  const token = auth.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const [rows]  = await pool.execute(
      'SELECT id, school_id, active_school_id, name, email, role FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    )
    if (!rows.length) return res.status(401).json({ message: 'User not found or deactivated' })
    const u = rows[0]
    // Branch support: the "effective" school is the active branch if set, else the home school.
    // Every route scopes by req.user.school_id, so this switches the whole app to the chosen branch.
    u.home_school_id = u.school_id
    u.school_id = u.active_school_id || u.school_id
    req.user = u
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

// A chairman is "above" a branch admin (per product spec), so once they've switched
// into a branch (req.user.school_id becomes that branch — see protect() above and
// PUT /api/branches/switch, which is chairman-only), they get full admin-equivalent
// access to that one branch's screens, scoped by the same school_id as always.
function requireAdmin(req, res, next) {
  if (!['admin', 'chairman'].includes(req.user?.role)) return res.status(403).json({ message: 'Admin access required' })
  next()
}

// Chairman sits above a single branch's admin — sees every branch in their group.
function requireChairman(req, res, next) {
  if (req.user?.role !== 'chairman') return res.status(403).json({ message: 'Chairman access required' })
  next()
}

module.exports = { protect, requireAdmin, requireChairman }