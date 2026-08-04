/**
 * migrate_phase2.js — Attendance, Exams, Report Cards, Roles
 * Run: node src/db/migrate_phase2.js
 */
require('dotenv').config()
const { pool } = require('./pool')

const TABLES = [

`CREATE TABLE IF NOT EXISTS classes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  school_id   INT NOT NULL,
  name        VARCHAR(50) NOT NULL,
  section     VARCHAR(10),
  teacher_id  INT,
  academic_year VARCHAR(10) DEFAULT '2025-26',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_classes_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS class_attendance (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  school_id   INT NOT NULL,
  student_id  INT NOT NULL,
  class_name  VARCHAR(50),
  date        DATE NOT NULL,
  status      VARCHAR(20) DEFAULT 'Present',
  marked_by   INT,
  notes       TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (student_id, date),
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_by)  REFERENCES users(id),
  INDEX idx_att_school (school_id),
  INDEX idx_att_date   (date),
  INDEX idx_att_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS subjects (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  school_id  INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  code       VARCHAR(20),
  class_name VARCHAR(50),
  max_marks  INT DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_subjects_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS exams (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  name          VARCHAR(150) NOT NULL,
  class_name    VARCHAR(50),
  exam_type     VARCHAR(50) DEFAULT 'Unit Test',
  start_date    DATE,
  end_date      DATE,
  academic_year VARCHAR(10) DEFAULT '2025-26',
  status        VARCHAR(20) DEFAULT 'Upcoming',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_exams_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS exam_marks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  school_id   INT NOT NULL,
  exam_id     INT NOT NULL,
  student_id  INT NOT NULL,
  subject_id  INT NOT NULL,
  marks       DECIMAL(6,2) DEFAULT 0,
  max_marks   INT DEFAULT 100,
  grade       VARCHAR(5),
  remarks     VARCHAR(200),
  entered_by  INT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marks (exam_id, student_id, subject_id),
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id)    REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  INDEX idx_marks_student (student_id),
  INDEX idx_marks_exam    (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS report_cards (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  school_id       INT NOT NULL,
  student_id      INT NOT NULL,
  exam_id         INT NOT NULL,
  total_marks     DECIMAL(8,2) DEFAULT 0,
  max_total       DECIMAL(8,2) DEFAULT 0,
  percentage      DECIMAL(5,2) DEFAULT 0,
  grade           VARCHAR(5),
  rank_in_class   INT,
  attendance_pct  DECIMAL(5,2) DEFAULT 0,
  remarks         TEXT,
  generated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report (student_id, exam_id),
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id)    REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_rc_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS staff_users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  user_id       INT NOT NULL,
  designation   VARCHAR(100),
  department    VARCHAR(100),
  employee_code VARCHAR(50),
  joined_date   DATE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_staff_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS bulk_imports (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  school_id   INT NOT NULL,
  import_type VARCHAR(50),
  filename    VARCHAR(255),
  total_rows  INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'Processing',
  errors      TEXT,
  imported_by INT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)   REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (imported_by) REFERENCES users(id),
  INDEX idx_imports_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

]

async function migrate() {
  console.log('🔄  Running Phase 2 migrations...')
  try {
    for (const sql of TABLES) {
      const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]
      await pool.execute(sql)
      console.log(`  ✓ ${name}`)
    }
    console.log('\n✅  Phase 2 tables created.')
  } catch (err) {
    console.error('❌  Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}
migrate()