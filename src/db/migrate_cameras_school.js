/**
 * EnrollIQ — Multi-school isolation for cameras
 * ---------------------------------------------
 * Save as:  src/db/migrate_cameras_school.js
 * Run:      node src/db/migrate_cameras_school.js
 *
 * The cameras table had no school_id, so every school saw every school's
 * cameras. This adds school_id and assigns existing demo cameras to the
 * first school. Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function columnExists(t, c) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [t, c])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n🏫  Cameras multi-school isolation\n')

  if (!(await columnExists('cameras', 'school_id'))) {
    await pool.query(`ALTER TABLE cameras ADD COLUMN school_id INT NULL`)
    await pool.query(`ALTER TABLE cameras ADD INDEX idx_cam_school (school_id)`)
    console.log('  ✅ cameras.school_id added')
  } else {
    console.log('  ⏭  cameras.school_id exists')
  }

  // assign any orphaned cameras to the first school so they stay visible
  const [[firstSchool]] = await pool.query(`SELECT id FROM schools ORDER BY id LIMIT 1`)
  if (firstSchool) {
    const [r] = await pool.execute(
      `UPDATE cameras SET school_id = ? WHERE school_id IS NULL`, [firstSchool.id])
    if (r.affectedRows) console.log(`  ✅ assigned ${r.affectedRows} existing camera(s) to school #${firstSchool.id}`)
  } else {
    console.log('  ⚠️  no schools found — add a school, then re-run')
  }

  console.log('\n✅  Camera isolation migration complete!\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })