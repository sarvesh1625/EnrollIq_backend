/**
 * EnrollIQ — Daily Updates (Diary / Homework / Activities)
 * Save as:  src/db/migrate_class_posts.js
 * Run:      node src/db/migrate_class_posts.js
 *
 * A teacher posts an update to a whole CLASS or one STUDENT. Parents see it in
 * the app. One table, a 'type' distinguishes diary / homework / activity.
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('\n📔  Daily Updates migration\n')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_posts (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      school_id    INT NOT NULL,
      academic_year_id INT NULL,
      post_type    VARCHAR(20) NOT NULL DEFAULT 'diary',   -- diary | homework | activity
      class_name   VARCHAR(50) NULL,                        -- target a class (null if per-student)
      section      VARCHAR(10) NULL,
      student_id   INT NULL,                                -- target ONE student (null if whole class)
      title        VARCHAR(200) NOT NULL,
      description  TEXT NULL,
      subject      VARCHAR(80) NULL,                        -- for homework
      due_date     DATE NULL,                               -- for homework
      post_date    DATE NOT NULL,
      posted_by    INT NULL,
      posted_by_name VARCHAR(120) NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cp_school (school_id),
      INDEX idx_cp_class (school_id, class_name),
      INDEX idx_cp_student (student_id)
    )
  `)
  console.log('  ✅ class_posts table ready')
  console.log('\n✅  Migration complete.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })