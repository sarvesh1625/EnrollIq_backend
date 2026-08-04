require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('🔄 Setting up ads tables...')
  try {
    // School ads campaigns table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS school_ads (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        school_id         INT NOT NULL,
        campaign_name     VARCHAR(200) NOT NULL,
        google_ads_account VARCHAR(100),
        google_campaign_id VARCHAR(100),
        landing_slug      VARCHAR(100) NOT NULL UNIQUE,
        status            ENUM('Active','Paused','Draft') DEFAULT 'Active',
        monthly_budget    DECIMAL(10,2),
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        INDEX idx_ads_school (school_id),
        INDEX idx_ads_slug (landing_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ school_ads table')

    // Ad events — clicks, enquiries, conversions
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ad_events (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        school_id   INT NOT NULL,
        ad_id       INT,
        event_type  ENUM('click','enquiry','call') DEFAULT 'click',
        source      VARCHAR(100) DEFAULT 'google',
        utm_campaign VARCHAR(200),
        utm_medium  VARCHAR(100),
        ip_address  VARCHAR(50),
        user_agent  TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        INDEX idx_events_school (school_id),
        INDEX idx_events_date (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ ad_events table')

    console.log('\n✅ Ads migration done!')
  } catch(err) {
    console.error('❌', err.message)
  } finally {
    await pool.end()
  }
}
migrate()