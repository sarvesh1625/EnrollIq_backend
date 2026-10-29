/**
 * Show or fix a user's role.
 *
 *   node src/db/fix_user_role.js sarvesh            -> only SHOWS matching users (name or email contains "sarvesh")
 *   node src/db/fix_user_role.js sarvesh admin      -> sets role = admin for the SINGLE matching user
 *
 * Valid roles: admin, staff, teacher, accountant, receptionist, transport_manager
 * It never changes anything unless you pass the role as the second argument,
 * and it refuses to change if more than one user matches.
 */
require('dotenv').config()
const { pool } = require('./pool')

const VALID = ['admin', 'staff', 'teacher', 'accountant', 'receptionist', 'transport_manager']

async function main() {
  const [search, newRole] = process.argv.slice(2)
  if (!search) { console.log('Usage: node src/db/fix_user_role.js <name-or-email> [new-role]'); return }

  const like = `%${search}%`
  const [rows] = await pool.query(
    'SELECT id, school_id, name, email, role, is_active FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id', [like, like])

  if (!rows.length) { console.log('No user found for', search); return }
  console.log('\nMatching users:')
  rows.forEach(r => console.log(`  id=${r.id}  school=${r.school_id}  ${r.name}  <${r.email}>  role="${r.role}"  active=${r.is_active}` +
    (VALID.includes(r.role) ? '' : '   <-- NOT a recognised role')))

  if (!newRole) { console.log('\nNothing changed. To fix, add the role: node src/db/fix_user_role.js', search, 'admin'); return }
  if (!VALID.includes(newRole)) { console.log(`\n"${newRole}" is not valid. Use one of: ${VALID.join(', ')}`); return }
  if (rows.length > 1) { console.log('\nMore than one user matches. Use the full email so only one matches.'); return }

  await pool.query('UPDATE users SET role = ? WHERE id = ?', [newRole, rows[0].id])
  console.log(`\nDone: ${rows[0].name} is now "${newRole}". Ask them to sign out and sign in again.`)
}

main().then(() => process.exit(0)).catch(e => { console.error('Failed:', e.message); process.exit(1) })