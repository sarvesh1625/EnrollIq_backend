require('dotenv').config()
const { pool } = require('./src/db/pool')

async function fix() {
  try {
    await pool.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'Basic'")
    await pool.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'Active'")
    await pool.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active'")
    await pool.execute("UPDATE schools SET status='Active' WHERE status IS NULL")
    await pool.execute("UPDATE schools SET subscription_plan='Basic' WHERE subscription_plan IS NULL")
    await pool.execute("UPDATE schools SET subscription_status='Active' WHERE subscription_status IS NULL")
    console.log('✅ Fixed! All columns added.')
  } catch (err) {
    console.error('❌', err.message)
  } finally {
    await pool.end()
  }
}
fix()