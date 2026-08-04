const bcrypt    = require('bcryptjs')
const jwt       = require('jsonwebtoken')
const { pool }  = require('../db/pool')

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })

    const [rows] = await pool.execute(`
      SELECT u.id, u.school_id, u.name, u.email, u.password_hash, u.role,
             u.must_change_password,
             s.name AS school_name
      FROM   users u
      LEFT JOIN schools s ON s.id = u.school_id
      WHERE  u.email = ? AND u.is_active = 1
    `, [email.toLowerCase()])

    if (!rows.length) return res.status(401).json({ message: 'Invalid email or password' })

    const user  = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ message: 'Invalid email or password' })

    // Record login. Clear the "first login pending" flag — the staff member
    // has now successfully signed in, so the onboarding step is complete.
    await pool.execute(
      'UPDATE users SET last_login = NOW(), must_change_password = 0 WHERE id = ?',
      [user.id])

    res.json({
      token: signToken(user.id),
      user: {
        id: user.id, school_id: user.school_id, name: user.name, email: user.email,
        role: user.role, school_name: user.school_name,
        must_change_password: !!user.must_change_password,   // value AT this login (for a future force-change screen)
      }
    })
  } catch (err) { next(err) }
}

// GET /api/auth/me
async function getMe(req, res, next) {
  try {
    const [rows] = await pool.execute(`
      SELECT u.id, u.school_id, u.name, u.email, u.role, u.last_login,
             s.name AS school_name, s.city, s.board
      FROM   users u
      LEFT JOIN schools s ON s.id = u.school_id
      WHERE  u.id = ?
    `, [req.user.id])

    if (!rows.length) return res.status(404).json({ message: 'User not found' })
    res.json(rows[0])
  } catch (err) { next(err) }
}

// PUT /api/auth/password
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body
    if (!current_password || !new_password) return res.status(400).json({ message: 'Both passwords are required' })
    if (new_password.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' })

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
    const valid  = await bcrypt.compare(current_password, rows[0].password_hash)
    if (!valid) return res.status(400).json({ message: 'Current password is incorrect' })

    const hash = await bcrypt.hash(new_password, 10)
    // Changing the password also completes onboarding, so clear the flag here too.
    await pool.execute(
      'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
      [hash, req.user.id])
    res.json({ message: 'Password changed successfully' })
  } catch (err) { next(err) }
}

module.exports = { login, getMe, changePassword }