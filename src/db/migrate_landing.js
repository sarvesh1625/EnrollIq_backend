require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('🔄 Adding testimonials & chatbot tables...')
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS school_testimonials (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        school_id  INT NOT NULL,
        parent_name VARCHAR(150) NOT NULL,
        child_grade VARCHAR(50),
        rating     INT DEFAULT 5,
        review     TEXT NOT NULL,
        is_active  TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        INDEX idx_test_school (school_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ school_testimonials')

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chatbot_sessions (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        school_id   INT NOT NULL,
        session_id  VARCHAR(100) NOT NULL,
        messages    TEXT,
        lead_data   TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        INDEX idx_chat_school (school_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ chatbot_sessions')

    // Add extra columns to schools
    const cols = [
      "ADD COLUMN IF NOT EXISTS achievements TEXT",
      "ADD COLUMN IF NOT EXISTS affiliation_no VARCHAR(100)",
      "ADD COLUMN IF NOT EXISTS principal_name VARCHAR(150)",
      "ADD COLUMN IF NOT EXISTS medium VARCHAR(50) DEFAULT 'English'",
      "ADD COLUMN IF NOT EXISTS school_timing VARCHAR(100)",
      "ADD COLUMN IF NOT EXISTS website VARCHAR(200)",
      "ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20)",
    ]
    for (const col of cols) {
      await pool.execute(`ALTER TABLE schools ${col}`).catch(()=>{})
    }
    console.log('  ✓ schools columns updated')

    // Add demo testimonials for existing school
    const [schools] = await pool.execute("SELECT id FROM schools WHERE status='Active' LIMIT 1")
    if (schools.length) {
      const sid = schools[0].id
      const [existing] = await pool.execute('SELECT id FROM school_testimonials WHERE school_id=? LIMIT 1',[sid])
      if (!existing.length) {
        const testimonials = [
          [sid,'Sunita Reddy','Grade 4',5,'Excellent school with dedicated teachers. My daughter loves going to school every day. The faculty is very supportive and the infrastructure is world-class.'],
          [sid,'Mohan Kumar','Grade 1',5,'Best decision we made for our son. The school has a perfect balance of academics and extracurriculars. Highly recommend!'],
          [sid,'Priya Sharma','Grade 6',4,'Very happy with the school. Teachers are experienced and caring. The transport facility is also very reliable.'],
          [sid,'Rajesh Nair','Grade 9',5,'My daughter scored 98% in boards. The school\'s teaching methodology is excellent. Thank you to all the teachers!'],
        ]
        for (const t of testimonials) {
          await pool.execute(
            'INSERT INTO school_testimonials (school_id,parent_name,child_grade,rating,review) VALUES (?,?,?,?,?)', t)
        }
        console.log('  ✓ Demo testimonials added')
      }
    }

    console.log('✅ Done!')
  } catch(err) {
    console.error('❌', err.message)
  } finally {
    await pool.end()
  }
}
migrate()