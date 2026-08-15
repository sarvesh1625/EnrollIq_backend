/**
 * scripts/runAiExamSchema.js
 *
 * Creates the 4 tables needed for the AI Exam System:
 *   question_papers, exam_questions, answer_sheets, report_card_insights
 *
 * USAGE (run from your backend project root):
 *   node scripts/runAiExamSchema.js
 *
 * Safe to re-run — every statement uses CREATE TABLE IF NOT EXISTS.
 */

const { pool } = require('../src/db/pool')

const STATEMENTS = [
  {
    name: 'question_papers',
    sql: `
      CREATE TABLE IF NOT EXISTS question_papers (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        school_id     INT NOT NULL,
        exam_id       INT NOT NULL,
        subject_id    INT NOT NULL,
        class_name    VARCHAR(50),
        topics        TEXT,
        difficulty    VARCHAR(20) DEFAULT 'Medium',
        total_marks   INT DEFAULT 100,
        generated_by  INT,
        status        VARCHAR(20) DEFAULT 'Draft',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id)    REFERENCES exams(id)    ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        INDEX idx_qp_exam (exam_id),
        INDEX idx_qp_school (school_id)
      )
    `,
  },
  {
    name: 'exam_questions',
    sql: `
      CREATE TABLE IF NOT EXISTS exam_questions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        paper_id        INT NOT NULL,
        question_number INT,
        question_text   TEXT NOT NULL,
        question_type   VARCHAR(20) DEFAULT 'Short Answer',
        options         JSON NULL,
        correct_answer  TEXT NULL,
        marks           INT DEFAULT 1,
        FOREIGN KEY (paper_id) REFERENCES question_papers(id) ON DELETE CASCADE,
        INDEX idx_eq_paper (paper_id)
      )
    `,
  },
  {
    name: 'answer_sheets',
    sql: `
      CREATE TABLE IF NOT EXISTS answer_sheets (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        school_id           INT NOT NULL,
        exam_id             INT NOT NULL,
        student_id          INT NOT NULL,
        subject_id          INT NOT NULL,
        paper_id            INT NULL,
        image_path          VARCHAR(500),
        extracted_text      LONGTEXT,
        ai_marks            DECIMAL(6,2),
        max_marks           DECIMAL(6,2),
        ai_feedback         TEXT,
        question_breakdown  JSON NULL,
        status              VARCHAR(20) DEFAULT 'Pending',
        graded_at           TIMESTAMP NULL,
        reviewed_by         INT NULL,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id)    REFERENCES exams(id)    ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        INDEX idx_as_exam (exam_id),
        INDEX idx_as_student (student_id)
      )
    `,
  },
  {
    name: 'report_card_insights',
    sql: `
      CREATE TABLE IF NOT EXISTS report_card_insights (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        school_id       INT NOT NULL,
        student_id      INT NOT NULL,
        exam_id         INT NOT NULL,
        summary         TEXT,
        weak_subjects   JSON,
        strong_subjects JSON,
        trend           VARCHAR(20),
        alert_level     VARCHAR(20) DEFAULT 'None',
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_student_exam (student_id, exam_id),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (exam_id)    REFERENCES exams(id)    ON DELETE CASCADE
      )
    `,
  },
]

async function main() {
  console.log('\nRunning AI Exam System schema...\n')
  try {
    for (const { name, sql } of STATEMENTS) {
      await pool.query(sql)
      console.log(`  Created (or already exists): ${name}`)
    }
    console.log('\nAll tables ready.\n')
    process.exit(0)
  } catch (err) {
    console.error('\nError creating schema:', err.message)
    console.error('\nIf this mentions a missing table (e.g. "exams" or "subjects" or "students"),')
    console.error('those base tables must already exist before this schema can add its foreign keys.\n')
    process.exit(1)
  }
}

main()
