require('dotenv').config()
const { pool } = require('./pool')
const bcrypt   = require('bcryptjs')

async function migrate() {
  console.log('🔄 Setting up super admin...')
  try {
    // Add subscription columns to schools
    await pool.execute(`ALTER TABLE schools
      ADD COLUMN IF NOT EXISTS subscription_plan    VARCHAR(50)  DEFAULT 'Basic',
      ADD COLUMN IF NOT EXISTS subscription_status  VARCHAR(20)  DEFAULT 'Active',
      ADD COLUMN IF NOT EXISTS subscription_expires DATE,
      ADD COLUMN IF NOT EXISTS status               VARCHAR(20)  DEFAULT 'Active'
    `).catch(() => console.log('  (columns may already exist — OK)'))

    // Create super_admins table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(150) NOT NULL,
        email         VARCHAR(200) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_active     TINYINT(1) DEFAULT 1,
        last_login    DATETIME,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ super_admins table ready')

    // Create default super admin
    const [existing] = await pool.execute(
      'SELECT id FROM super_admins WHERE email=?',
      ['superadmin@enrolliq.com']
    )

    if (!existing.length) {
      const hash = await bcrypt.hash('SuperAdmin@123', 10)
      await pool.execute(
        'INSERT INTO super_admins (name, email, password_hash) VALUES (?,?,?)',
        ['Super Admin', 'superadmin@enrolliq.com', hash]
      )
      console.log('\n  ✅ Super admin created!')
      console.log('  📧 Email:    superadmin@enrolliq.com')
      console.log('  🔑 Password: SuperAdmin@123')
      console.log('  ⚠️  Change password after first login!\n')
    } else {
      console.log('  ✓ Super admin already exists')
    }

    console.log('✅ Done!')
  } catch (err) {
    console.error('❌ Error:', err.message)
  } finally {
    await pool.end()
  }
}

migrate()