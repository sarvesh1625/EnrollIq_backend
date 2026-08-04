/**
 * rbac.js — Role Based Access Control
 * Roles: admin > staff > viewer
 */

const ROLE_LEVELS = { viewer: 1, staff: 2, admin: 3 }

function checkRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' })

    const userLevel     = ROLE_LEVELS[req.user.role] || 0
    const requiredLevel = Math.min(...allowedRoles.map(r => ROLE_LEVELS[r] || 99))

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        message: `Access denied. Required: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
      })
    }
    next()
  }
}

// Export named middleware functions — use these in routes
const adminOnly  = checkRole('admin')
const staffPlus  = checkRole('staff', 'admin')
const viewerPlus = checkRole('viewer', 'staff', 'admin')

module.exports = { adminOnly, staffPlus, viewerPlus }