/**
 * migrate.js — MySQL version
 * Run: node src/db/migrate.js
 * Database: cmr_of_school
 */
require('dotenv').config()
const { pool } = require('./pool')

const TABLES = [

`CREATE TABLE IF NOT EXISTS schools (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  city          VARCHAR(100),
  area          VARCHAR(100),
  board         VARCHAR(50),
  phone         VARCHAR(20),
  email         VARCHAR(150),
  website       VARCHAR(200),
  established   INT,
  student_count INT,
  fee_range     VARCHAR(100),
  tags          TEXT,
  rating        DECIMAL(3,1) DEFAULT 0,
  review_count  INT DEFAULT 0,
  is_active     TINYINT(1) DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30) DEFAULT 'admin',
  is_active     TINYINT(1) DEFAULT 1,
  last_login    DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS user_sessions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT,
  token_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS leads (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT,
  parent_name   VARCHAR(150) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  email         VARCHAR(150),
  child_grade   VARCHAR(30),
  area          VARCHAR(100),
  lead_source   VARCHAR(50) DEFAULT 'Website',
  keyword       VARCHAR(255),
  notes         TEXT,
  status        VARCHAR(50) DEFAULT 'New',
  ai_score      INT DEFAULT 0,
  ai_label      VARCHAR(10) DEFAULT 'Cold',
  assigned_to   INT,
  is_duplicate  TINYINT(1) DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)   REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  INDEX idx_leads_school   (school_id),
  INDEX idx_leads_status   (status),
  INDEX idx_leads_ai_label (ai_label),
  INDEX idx_leads_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS lead_interactions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  lead_id    INT NOT NULL,
  user_id    INT,
  type       VARCHAR(30) NOT NULL,
  notes      TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_interactions_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS admissions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  school_id      INT,
  lead_id        INT,
  student_name   VARCHAR(150) NOT NULL,
  date_of_birth  DATE,
  grade_applied  VARCHAR(30),
  parent_name    VARCHAR(150),
  parent_phone   VARCHAR(20),
  parent_email   VARCHAR(150),
  docs_complete  TINYINT(1) DEFAULT 0,
  status         VARCHAR(50) DEFAULT 'New',
  admission_date DATE,
  notes          TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id)   REFERENCES leads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS students (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  school_id    INT,
  admission_id INT,
  roll_number  VARCHAR(20),
  name         VARCHAR(150) NOT NULL,
  class        VARCHAR(20),
  section      VARCHAR(10),
  dob          DATE,
  parent_name  VARCHAR(150),
  parent_phone VARCHAR(20),
  parent_email VARCHAR(150),
  area         VARCHAR(100),
  status       VARCHAR(20) DEFAULT 'Active',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)    REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (admission_id) REFERENCES admissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS fee_structures (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT,
  name          VARCHAR(100) NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  class         VARCHAR(30),
  academic_year VARCHAR(10),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  school_id    INT,
  student_id   INT,
  fee_type     VARCHAR(100),
  amount       DECIMAL(10,2) NOT NULL,
  paid_amount  DECIMAL(10,2) DEFAULT 0,
  due_date     DATE,
  paid_date    DATE,
  payment_mode VARCHAR(30),
  status       VARCHAR(20) DEFAULT 'Pending',
  reference_no VARCHAR(100),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  school_id       INT,
  sent_by         INT,
  student_id      INT,
  lead_id         INT,
  recipient_name  VARCHAR(150),
  recipient_phone VARCHAR(20),
  channel         VARCHAR(20) DEFAULT 'WhatsApp',
  body            TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'Sent',
  sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (sent_by)    REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (lead_id)    REFERENCES leads(id),
  INDEX idx_messages_school  (school_id),
  INDEX idx_messages_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS announcements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  school_id       INT,
  sent_by         INT,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  audience        VARCHAR(50) DEFAULT 'All',
  audience_filter VARCHAR(50),
  channel         VARCHAR(20) DEFAULT 'WhatsApp',
  recipient_count INT DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'Sent',
  sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (sent_by)   REFERENCES users(id),
  INDEX idx_announcements_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS notification_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  school_id  INT,
  type       VARCHAR(50),
  title      VARCHAR(200),
  body       TEXT,
  link       VARCHAR(200),
  is_read    TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_notif_school (school_id),
  INDEX idx_notif_read   (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS analytics_daily (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  school_id        INT,
  date             DATE NOT NULL,
  leads_count      INT DEFAULT 0,
  admissions_count INT DEFAULT 0,
  fees_collected   DECIMAL(12,2) DEFAULT 0,
  UNIQUE KEY uq_analytics (school_id, date),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

]

async function migrate() {
  console.log('🔄  Running MySQL migrations on cmr_of_school...')
  try {
    for (const sql of TABLES) {
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]
      await pool.execute(sql)
      console.log(`  ✓ ${tableName}`)
    }
    console.log('\n✅  All tables created successfully.')
  } catch (err) {
    console.error('❌  Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()