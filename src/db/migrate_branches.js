/**
 * EnrollIQ — Multi-branch (school groups)
 * Save as:  src/db/migrate_branches.js
 * Run:      node src/db/migrate_branches.js
 *
 * - schools.group_id       : branches sharing a group_id belong to one enterprise
 * - schools.is_main_branch : the "head" school of the group
 * - users.active_school_id : which branch the admin is currently viewing
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function hasCol(table, col) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`, [table, col])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n🏫  Multi-branch migration\n')

  if (!(await hasCol('schools', 'group_id'))) {
    await pool.query('ALTER TABLE schools ADD COLUMN group_id INT NULL')
    console.log('  ✅ schools.group_id added')
  } else console.log('  ⏭  schools.group_id exists')

  if (!(await hasCol('schools', 'is_main_branch'))) {
    await pool.query("ALTER TABLE schools ADD COLUMN is_main_branch TINYINT DEFAULT 1")
    console.log('  ✅ schools.is_main_branch added')
  } else console.log('  ⏭  schools.is_main_branch exists')

  if (!(await hasCol('users', 'active_school_id'))) {
    await pool.query('ALTER TABLE users ADD COLUMN active_school_id INT NULL')
    console.log('  ✅ users.active_school_id added')
  } else console.log('  ⏭  users.active_school_id exists')

  // Default: each existing school is its own group (group_id = its own id),
  // and each user's active_school_id = their school_id.
  await pool.query('UPDATE schools SET group_id = id WHERE group_id IS NULL')
  await pool.query('UPDATE users SET active_school_id = school_id WHERE active_school_id IS NULL')
  console.log('  ✅ backfilled group_id and active_school_id')

  console.log('\n✅  Done.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })