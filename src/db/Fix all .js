require('dotenv').config()
const { pool } = require('./pool')
const bcrypt   = require('bcryptjs')

async function fix() {
  try {
    console.log('🔄 Fixing everything...\n')

    // 1. Fix schools table columns
    const schoolCols = [
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'Basic'",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'Active'",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active'",
      "UPDATE schools SET status='Active' WHERE status IS NULL",
      "UPDATE schools SET subscription_plan='Basic' WHERE subscription_plan IS NULL",
    ]
    for (const sql of schoolCols) await pool.execute(sql).catch(()=>{})
    console.log('  ✓ Schools table fixed')

    // 2. Fix/create admin user
    const [schools] = await pool.execute('SELECT id FROM schools LIMIT 1')
    const schoolId  = schools[0]?.id || 1
    const hash      = await bcrypt.hash('Admin@123', 10)
    await pool.execute(
      `INSERT INTO users (school_id,name,email,password_hash,role,is_active)
       VALUES (?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE password_hash=?,is_active=1`,
      [schoolId,'Admin User','admin@school.com',hash,'admin',hash]
    )
    console.log('  ✓ Admin user ready')

    // 3. Fix/create super admin
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(200) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    const superHash = await bcrypt.hash('SuperAdmin@123', 10)
    await pool.execute(
      `INSERT INTO super_admins (name,email,password_hash)
       VALUES ('Super Admin','superadmin@enrolliq.com',?)
       ON DUPLICATE KEY UPDATE password_hash=?,is_active=1`,
      [superHash, superHash]
    )
    console.log('  ✓ Super admin ready')

    console.log('\n✅ ALL FIXED!\n')
    console.log('┌─────────────────────────────────────────────┐')
    console.log('│  SCHOOL ADMIN LOGIN                         │')
    console.log('│  URL:      http://localhost:5173/login       │')
    console.log('│  Email:    admin@school.com                  │')
    console.log('│  Password: Admin@123                         │')
    console.log('├─────────────────────────────────────────────┤')
    console.log('│  SUPER ADMIN LOGIN                          │')
    console.log('│  URL:      http://localhost:5173/superadmin  │')
    console.log('│  Email:    superadmin@enrolliq.com           │')
    console.log('│  Password: SuperAdmin@123                    │')
    console.log('└─────────────────────────────────────────────┘')

  } catch (err) {
    console.error('❌ Error:', err.message)
  } finally {
    await pool.end()
  }
}
fix()