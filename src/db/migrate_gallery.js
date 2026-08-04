require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('🔄 Adding gallery table...')
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS school_gallery (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        school_id  INT NOT NULL,
        image_url  VARCHAR(500) NOT NULL,
        caption    VARCHAR(200),
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        INDEX idx_gallery_school (school_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ school_gallery table created')

    // Add tagline column to schools
    await pool.execute(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS tagline VARCHAR(200)`).catch(()=>{})
    await pool.execute(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS highlights TEXT`).catch(()=>{})
    console.log('  ✓ schools columns updated')
    console.log('✅ Done!')
  } catch (err) {
    console.error('❌', err.message)
  } finally {
    await pool.end()
  }
}
migrate()