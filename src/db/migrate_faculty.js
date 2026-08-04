/**
 * EnrollIQ — School Faculty (for the public landing page)
 * -------------------------------------------------------
 * Save as:  src/db/migrate_faculty.js
 * Run:      node src/db/migrate_faculty.js
 *
 * Adds a school_faculty table so schools can list teachers with a photo,
 * name, role and a short bio on their public landing page.
 * Mirrors the school_gallery pattern. Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('\n👩‍🏫  School Faculty migration\n')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_faculty (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      school_id   INT NOT NULL,
      name        VARCHAR(100) NOT NULL,
      role        VARCHAR(100) NULL,          -- 'Principal', 'Maths Teacher'
      bio         VARCHAR(300) NULL,          -- short description
      photo_url   VARCHAR(255) NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_faculty_school (school_id, sort_order),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ school_faculty table ready')

  console.log('\n✅  Faculty migration complete!\n')
  await pool.end()
}

migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })