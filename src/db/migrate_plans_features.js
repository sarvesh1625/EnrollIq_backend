/**
 * EnrollIQ — Plans & Feature Gating
 * ---------------------------------
 * Save as:  src/db/migrate_plans_features.js
 * Run:      node src/db/migrate_plans_features.js
 *
 * Adds a `plan` to each school and a school_features table that stores
 * per-school feature overrides. Plan sets defaults; overrides win.
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

// Feature keys the system knows about. Add new ones here as features are built.
const FEATURES = ['ai_assistant', 'ai_exam_system']

// Which features each plan includes by DEFAULT.
const PLAN_DEFAULTS = {
  basic:      { ai_assistant: false, ai_exam_system: false },
  premium:    { ai_assistant: true,  ai_exam_system: false },
  enterprise: { ai_assistant: true,  ai_exam_system: true  },
}

async function hasCol(table, col) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`, [table, col])
  return r[0].n > 0
}

async function migrate() {
  console.log('\n🎫  Plans & feature gating migration\n')

  // 1) Use the EXISTING subscription_plan column (already on schools).
  //    Normalize any blank/unknown values to 'basic' so gating is predictable.
  await pool.query(
    `UPDATE schools SET subscription_plan='basic'
     WHERE subscription_plan IS NULL OR subscription_plan=''
        OR LOWER(subscription_plan) NOT IN ('basic','premium','enterprise')`)
  await pool.query(`UPDATE schools SET subscription_plan=LOWER(subscription_plan)`)
  console.log('  ✅ subscription_plan normalized to basic/premium/enterprise')

  // 2) school_features: per-school override (feature_key -> enabled)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_features (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      school_id    INT NOT NULL,
      feature_key  VARCHAR(50) NOT NULL,
      enabled      TINYINT(1) NOT NULL DEFAULT 0,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_school_feature (school_id, feature_key),
      INDEX idx_sf_school (school_id)
    )
  `)
  console.log('  ✅ school_features table ready')

  console.log('\n  Feature keys:', FEATURES.join(', '))
  console.log('  Plan defaults:')
  for (const [plan, feats] of Object.entries(PLAN_DEFAULTS)) {
    console.log(`     ${plan.padEnd(11)} ${Object.entries(feats).map(([k,v])=>`${k}=${v?'on':'off'}`).join(', ')}`)
  }
  console.log('\n✅  Migration complete. (No school plans changed — all default to basic.)\n')
  await pool.end()
}
migrate().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })