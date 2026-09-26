require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_ads_connections (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      school_id         INT NOT NULL,
      customer_id       VARCHAR(20) NULL,
      refresh_token     TEXT NOT NULL,
      connected_by      INT NULL,
      connected_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_synced_at    DATETIME NULL,
      last_error        VARCHAR(255) NULL,
      sync_enabled      TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uniq_school_google_ads (school_id),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_platform_stats (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      school_id     INT NOT NULL,
      platform      VARCHAR(20) NOT NULL,
      stat_date     DATE NOT NULL,
      campaign_name VARCHAR(150) NULL,
      impressions   INT NOT NULL DEFAULT 0,
      clicks        INT NOT NULL DEFAULT 0,
      cost          DECIMAL(10,2) NOT NULL DEFAULT 0,
      conversions   INT NOT NULL DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_stat_row (school_id, platform, stat_date, campaign_name),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
      INDEX idx_stats_school_platform_date (school_id, platform, stat_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  console.log('✅ google_ads_connections + ad_platform_stats tables ready')
  process.exit(0)
}

run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })