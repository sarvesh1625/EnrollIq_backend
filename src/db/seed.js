/**
 * seed.js — MySQL version
 * Run: node src/db/seed.js
 */
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { pool } = require('./pool')

async function seed() {
  console.log('🌱  Seeding demo data into cmr_of_school...')

  // ── 1. Demo school ──────────────────────────────────────────────────────────
  const [existingSchool] = await pool.execute(`SELECT id FROM schools WHERE name = ?`, ['CMR School'])
  let schoolId

  if (existingSchool.length > 0) {
    schoolId = existingSchool[0].id
    console.log(`  School already exists — id: ${schoolId}`)
  } else {
    const [res] = await pool.execute(`
      INSERT INTO schools (name, city, area, board, phone, email, fee_range, tags, rating, review_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['CMR School', 'Hyderabad', 'Madhapur', 'CBSE', '+91 40 1234 5678',
        'admin@cmrschool.com', '₹80,000/yr', 'Smart classrooms,Sports ground,AI lab', 4.8, 124])
    schoolId = res.insertId
    console.log(`  School created — id: ${schoolId}`)
  }

  // ── 2. Admin user ───────────────────────────────────────────────────────────
  const [existingUser] = await pool.execute(`SELECT id FROM users WHERE email = ?`, ['admin@school.com'])
  if (existingUser.length === 0) {
    const hash = await bcrypt.hash('Admin@123', 10)
    await pool.execute(`
      INSERT INTO users (school_id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `, [schoolId, 'Admin User', 'admin@school.com', hash, 'admin'])
    console.log('  Admin user created: admin@school.com / Admin@123')
  } else {
    console.log('  Admin user already exists')
  }

  // ── 3. Sample leads ─────────────────────────────────────────────────────────
  const leads = [
    ['Sunita Reddy',   '9876543210', 'sunita@gmail.com',  'Grade 4', 'Madhapur',     'Google Ads', 'best school madhapur',    91, 'Hot',  'Campus Visit'],
    ['Mohan Kumar',    '9812345678', '',                  'Grade 1', 'Gachibowli',   'WhatsApp',   '',                        72, 'Warm', 'Contacted'],
    ['Priya Patel',    '9988776655', 'priya@gmail.com',   'Grade 6', 'Kondapur',     'Form',       'cbse school near me',     45, 'Cold', 'New'],
    ['Ravi Shankar',   '9000112233', '',                  'Grade 3', 'Madhapur',     'Google Ads', 'top school hyderabad',    88, 'Hot',  'Contacted'],
    ['Anitha Lakshmi', '9123456789', 'anitha@gmail.com',  'Grade 8', 'Banjara Hills','Facebook',   '',                        60, 'Warm', 'New'],
    ['Deepak Nair',    '9345678901', 'deepak@gmail.com',  'Grade 2', 'Gachibowli',   'Google Ads', 'school admissions 2026', 95, 'Hot',  'Admission'],
    ['Kavitha Rao',    '9456789012', '',                  'Grade 5', 'Secunderabad', 'Form',       '',                        38, 'Cold', 'Lost'],
    ['Suresh Babu',    '9567890123', 'suresh@gmail.com',  'Grade 9', 'Kondapur',     'WhatsApp',   '',                        77, 'Warm', 'Campus Visit'],
  ]

  let leadsInserted = 0
  for (const [parent_name, phone, email, child_grade, area, lead_source, keyword, ai_score, ai_label, status] of leads) {
    const [existing] = await pool.execute(`SELECT id FROM leads WHERE phone = ? AND school_id = ?`, [phone, schoolId])
    if (existing.length === 0) {
      await pool.execute(`
        INSERT INTO leads (school_id, parent_name, phone, email, child_grade, area, lead_source, keyword, ai_score, ai_label, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [schoolId, parent_name, phone, email || null, child_grade, area, lead_source, keyword || null, ai_score, ai_label, status])
      leadsInserted++
    }
  }
  console.log(`  ${leadsInserted} leads inserted`)

  // ── 4. Sample students ──────────────────────────────────────────────────────
  const students = [
    ['S-001', 'Arjun Pillai',   'Grade 4', 'A', '2016-03-12', 'Suresh Pillai',  '9876500007', 'suresh@gmail.com',  'Madhapur'],
    ['S-002', 'Deepa Kumar',    'Grade 2', 'B', '2018-07-22', 'Rakesh Kumar',   '9876500008', 'rakesh@gmail.com',  'Gachibowli'],
    ['S-003', 'Mohan Reddy',    'Grade 6', 'A', '2014-11-05', 'Krishnam Reddy', '9876500005', '',                  'Kondapur'],
    ['S-004', 'Priya Nair',     'Grade 3', 'C', '2017-05-30', 'Ajay Nair',      '9876500002', 'ajay@gmail.com',    'Madhapur'],
    ['S-005', 'Ankit Verma',    'Grade 8', 'B', '2012-09-14', 'Naresh Verma',   '9876500003', 'naresh@gmail.com',  'Banjara Hills'],
  ]

  let studentsInserted = 0
  for (const [roll, name, cls, section, dob, pname, pphone, pemail, area] of students) {
    const [existing] = await pool.execute(`SELECT id FROM students WHERE roll_number = ? AND school_id = ?`, [roll, schoolId])
    if (existing.length === 0) {
      await pool.execute(`
        INSERT INTO students (school_id, roll_number, name, class, section, dob, parent_name, parent_phone, parent_email, area)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [schoolId, roll, name, cls, section, dob, pname, pphone, pemail || null, area])
      studentsInserted++
    }
  }
  console.log(`  ${studentsInserted} students inserted`)

  // ── 5. Sample payments ──────────────────────────────────────────────────────
  const [studentRows] = await pool.execute(`SELECT id FROM students WHERE school_id = ? LIMIT 5`, [schoolId])
  if (studentRows.length > 0) {
    const payData = [
      [studentRows[0].id, 'Term 2 Tuition', 45000, 45000, '2026-04-01', '2026-03-30', 'UPI',   'Paid'],
      [studentRows[1].id, 'Term 2 Tuition', 38000, 38000, '2026-04-01', '2026-04-02', 'Online Transfer', 'Paid'],
      [studentRows[2].id, 'Transport Fee',  12000, 0,     '2026-04-05', null,          null,    'Pending'],
      [studentRows[3].id, 'Annual Fee',     20000, 0,     '2026-03-15', null,          null,    'Overdue'],
      [studentRows[4].id, 'Term 2 Tuition', 55000, 0,    '2026-04-01', null,          null,    'Pending'],
    ]
    for (const [sid, fee_type, amount, paid, due, paid_date, mode, status] of payData) {
      const [ex] = await pool.execute(`SELECT id FROM payments WHERE student_id = ? AND fee_type = ?`, [sid, fee_type])
      if (ex.length === 0) {
        await pool.execute(`
          INSERT INTO payments (school_id, student_id, fee_type, amount, paid_amount, due_date, paid_date, payment_mode, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [schoolId, sid, fee_type, amount, paid, due, paid_date, mode, status])
      }
    }
    console.log('  Sample payments inserted')
  }

  console.log('\n✅  Seed complete!')
  console.log('   Login: admin@school.com  |  Password: Admin@123')
  await pool.end()
}

seed().catch(err => {
  console.error('❌  Seed failed:', err.message)
  process.exit(1)
})