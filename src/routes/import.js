/**
 * EnrollIQ — school-level bulk import is switched OFF.
 * Save as:  backend/src/routes/import.js   (replaces the old file)
 *
 * Importing data is now done only by the platform Super Admin, from the Super Admin dashboard
 * (Data tools tab → routes/superadminData.js). Whatever the school login, these old addresses
 * answer 403 so nobody can reach the import by calling the API directly either.
 */
const router = require('express').Router()
router.use((req, res) => res.status(403).json({
  message: 'Bulk import is managed by the platform Super Admin. Please contact EnrollIQ support to import your data.',
}))
module.exports = router