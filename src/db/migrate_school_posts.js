/**
 * EnrollIQ — School posters (festival / holiday / announcement posts for parents)
 * ---------------------------------------------------------------------------------
 * Save as:  src/db/migrate_school_posts.js
 * Run:      node src/db/migrate_school_posts.js
 *
 * school_posts           — every poster a school creates (draft or published to parents)
 * school_poster_settings — one row per school: logo, brand colour, principal name, tagline
 *                          (set once, reused on every poster)
 * Safe to re-run.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_posts (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      school_id       INT NOT NULL,
      created_by      INT NULL,
      template_key    VARCHAR(30)  NOT NULL DEFAULT 'announcement',
      title           VARCHAR(200) NOT NULL,
      caption         TEXT NULL,
      image_url       VARCHAR(500) NOT NULL,
      image_public_id VARCHAR(255) NULL,
      event_date      DATE NULL,
      target_classes  VARCHAR(500) NULL,            -- NULL = all parents; else comma list e.g. 'Grade 1,Grade 2'
      status          ENUM('draft','published') NOT NULL DEFAULT 'draft',
      published_at    DATETIME NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
      INDEX idx_posts_school_status (school_id, status, published_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_poster_settings (
      school_id       INT PRIMARY KEY,
      logo_url        VARCHAR(500) NULL,
      logo_public_id  VARCHAR(255) NULL,
      brand_color     VARCHAR(9)   NOT NULL DEFAULT '#4f46e5',
      principal_name  VARCHAR(150) NULL,
      tagline         VARCHAR(200) NULL,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  console.log('✅ school_posts + school_poster_settings tables ready')
  process.exit(0)
}

run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1) })