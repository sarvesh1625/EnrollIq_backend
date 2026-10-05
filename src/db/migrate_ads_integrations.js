/**
 * EnrollIQ — add the missing school_ads.integrations column
 * Save as:  src/db/migrate_ads_integrations.js
 * Run:      node src/db/migrate_ads_integrations.js     (safe to re-run)
 *
 * routes/ads.js saves each platform's credentials (Google Ads customer/campaign/
 * conversion IDs, WhatsApp, etc.) as JSON in school_ads.integrations — but no
 * migration ever created that column, so "Save credentials" fails with
 * "Unknown column 'integrations'" (HTTP 500) on any database that doesn't have it.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'school_ads' AND column_name = 'integrations'`)
  if (row.c) {
    console.log('  · school_ads.integrations already exists — nothing to do')
  } else {
    await pool.query('ALTER TABLE school_ads ADD COLUMN integrations TEXT NULL')
    console.log('  + added school_ads.integrations')
  }
  console.log('✅ done')
  process.exit(0)
}
run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })