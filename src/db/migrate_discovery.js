require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('🔄 Adding discovery columns to schools table...')
  try {
    const cols = [
      "ADD COLUMN IF NOT EXISTS area               VARCHAR(100)",
      "ADD COLUMN IF NOT EXISTS grades_offered     VARCHAR(200)",
      "ADD COLUMN IF NOT EXISTS fee_range_min      INT DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS fee_range_max      INT DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS banner_url         VARCHAR(500)",
      "ADD COLUMN IF NOT EXISTS description        TEXT",
      "ADD COLUMN IF NOT EXISTS facilities         TEXT",
      "ADD COLUMN IF NOT EXISTS latitude           DECIMAL(10,8)",
      "ADD COLUMN IF NOT EXISTS longitude          DECIMAL(11,8)",
      "ADD COLUMN IF NOT EXISTS rating             DECIMAL(3,1) DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS review_count       INT DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS established_year   INT",
      "ADD COLUMN IF NOT EXISTS total_students_count INT DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS is_listed          TINYINT(1) DEFAULT 0",
    ]

    for (const col of cols) {
      await pool.execute(`ALTER TABLE schools ${col}`).catch(() => {})
    }
    console.log('  ✓ Discovery columns added')

    // Update existing school as listed with sample coords (Hyderabad)
    await pool.execute(`
      UPDATE schools SET
        is_listed = 1,
        area = COALESCE(area, 'Madhapur'),
        grades_offered = COALESCE(grades_offered, 'Pre-KG to Grade 10'),
        fee_range_min = COALESCE(NULLIF(fee_range_min,0), 25000),
        fee_range_max = COALESCE(NULLIF(fee_range_max,0), 80000),
        description = COALESCE(description, 'A premier CBSE school focused on holistic education and academic excellence.'),
        facilities = COALESCE(facilities, 'Library,Sports Ground,Science Lab,Computer Lab,Transport,Canteen'),
        latitude = COALESCE(latitude, 17.4435),
        longitude = COALESCE(longitude, 78.3772),
        rating = COALESCE(NULLIF(rating,0), 4.5),
        review_count = COALESCE(NULLIF(review_count,0), 48),
        established_year = COALESCE(established_year, 2005)
      WHERE status = 'Active'
    `)
    console.log('  ✓ Existing schools updated as listed')
    console.log('\n✅ Discovery migration done!')
  } catch (err) {
    console.error('❌ Error:', err.message)
  } finally {
    await pool.end()
  }
}
migrate()