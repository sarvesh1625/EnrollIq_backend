/**
 * EnrollIQ — daily counter for AI poster backgrounds
 * Save as:  src/db/migrate_poster_ai_images.js
 * Run:      node src/db/migrate_poster_ai_images.js      (safe to re-run)
 *
 * One row per school per day, so a school can't run up the image-service bill.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poster_bg_usage (
      school_id  INT  NOT NULL,
      usage_date DATE NOT NULL,
      used       INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (school_id, usage_date),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.log('✅ poster_bg_usage table ready')
  process.exit(0)
}
run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })