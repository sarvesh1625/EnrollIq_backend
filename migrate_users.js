const { pool } = require('./pool')

async function migrateUsers() {
  try {
    console.log('Running users table migration...')

    await pool.execute(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone varchar(20) DEFAULT NULL AFTER email,
      ADD COLUMN IF NOT EXISTS subject varchar(100) DEFAULT NULL AFTER phone,
      ADD COLUMN IF NOT EXISTS joining_date date DEFAULT NULL AFTER subject,
      ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'Active' AFTER joining_date
    `)

    console.log('✅ users table updated successfully')
    process.exit(0)
  } catch (err) {
    // If IF NOT EXISTS not supported, try one by one
    const columns = [
      `ALTER TABLE users ADD COLUMN phone varchar(20) DEFAULT NULL AFTER email`,
      `ALTER TABLE users ADD COLUMN subject varchar(100) DEFAULT NULL AFTER phone`,
      `ALTER TABLE users ADD COLUMN joining_date date DEFAULT NULL AFTER subject`,
      `ALTER TABLE users ADD COLUMN status varchar(20) DEFAULT 'Active' AFTER joining_date`,
    ]

    for (const sql of columns) {
      try {
        await pool.execute(sql)
        console.log('✅ ' + sql.split('ADD COLUMN ')[1].split(' ')[0] + ' added')
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log('⏭  Column already exists — skipping')
        } else {
          console.log('❌ Error:', e.message)
        }
      }
    }

    console.log('✅ Migration complete')
    process.exit(0)
  }
}

migrateUsers()