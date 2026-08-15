/**
 * EnrollIQ — Add attachments to class_posts
 * Save as:  src/db/migrate_diary_attachments.js
 * Run:      node src/db/migrate_diary_attachments.js
 * Adds an 'attachments' JSON column (array of {url, type, name}). Safe to re-run.
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
  console.log('\n📎  Diary attachments migration\n')
  if (!(await hasCol('class_posts', 'attachments'))) {
    await pool.query(`ALTER TABLE class_posts ADD COLUMN attachments TEXT NULL`)
    console.log('  ✅ class_posts.attachments added')
  } else {
    console.log('  ⏭  attachments column already exists')
  }
  console.log('\n✅  Done.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })