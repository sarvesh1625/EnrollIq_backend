/**
 * EnrollIQ — Demo requests (sales leads from the landing page)
 * Save as:  src/db/migrate_demo_requests.js
 * Run:      node src/db/migrate_demo_requests.js
 * These are prospects for EnrollIQ itself (schools wanting a demo), separate
 * from parent leads. Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('\n📩  Demo requests migration\n')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_requests (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      name           VARCHAR(120) NOT NULL,
      institution    VARCHAR(160) NOT NULL,
      designation    VARCHAR(80)  NULL,
      mobile         VARCHAR(20)  NOT NULL,
      work_email     VARCHAR(160) NULL,
      institution_type VARCHAR(60) NULL,
      status         VARCHAR(30)  DEFAULT 'New',
      notes          TEXT NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_demo_status (status),
      INDEX idx_demo_created (created_at)
    )
  `)
  console.log('  ✅ demo_requests table ready')
  console.log('\n✅  Done.\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })