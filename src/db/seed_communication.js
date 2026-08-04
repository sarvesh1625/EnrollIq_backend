/**
 * seed_communication.js — MySQL version
 * Run: node src/db/seed_communication.js
 */
require('dotenv').config()
const { pool } = require('./pool')

async function seed() {
  console.log('🌱  Seeding communication data...')

  const [schools] = await pool.execute(`SELECT id FROM schools LIMIT 1`)
  const [users]   = await pool.execute(`SELECT id FROM users LIMIT 1`)
  const [students]= await pool.execute(`SELECT id, name, parent_name, parent_phone FROM students LIMIT 5`)

  if (!schools.length) {
    console.error('Run the main seed first: npm run db:seed')
    process.exit(1)
  }

  const schoolId = schools[0].id
  const userId   = users[0].id

  // Messages
  const messages = [
    { student: students[0], channel:'WhatsApp', body:'Fee receipt sent for Rs.45,000 — Term 2 Tuition. Thank you!', status:'Delivered' },
    { student: students[1], channel:'SMS',       body:'Reminder: Rs.55,000 fee due on 01 Apr 2026.', status:'Delivered' },
    { student: students[2], channel:'WhatsApp', body:'Your fee of Rs.20,000 is overdue since 15 Mar.', status:'Delivered' },
    { student: students[3], channel:'WhatsApp', body:'Campus visit confirmed for Saturday 10 AM.', status:'Sent' },
    { student: students[4], channel:'SMS',       body:'Transport fee of Rs.12,000 is due on 05 Apr 2026.', status:'Failed' },
  ]

  for (const m of messages) {
    if (!m.student) continue
    await pool.execute(`
      INSERT INTO messages (school_id, sent_by, student_id, recipient_name, recipient_phone, channel, body, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [schoolId, userId, m.student.id, m.student.parent_name, m.student.parent_phone, m.channel, m.body, m.status])
  }
  console.log(`  ${messages.length} messages seeded`)

  // Announcements
  const announcements = [
    { title:'Parent-teacher meeting', body:'PTM is scheduled on 12 April at 10 AM in school hall.', audience:'All', channel:'WhatsApp', count:498 },
    { title:'Grade 4 field trip notice', body:'Grade 4 students field trip to Science City on 15 April. Fee: Rs.500.', audience:'Grade-wise', filter:'Grade 4', channel:'WhatsApp', count:42 },
    { title:'Summer vacation schedule', body:'School closed from 15 May to 10 June for summer vacation.', audience:'All', channel:'SMS', count:498 },
  ]

  for (const a of announcements) {
    await pool.execute(`
      INSERT INTO announcements (school_id, sent_by, title, body, audience, audience_filter, channel, recipient_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sent')
    `, [schoolId, userId, a.title, a.body, a.audience, a.filter || null, a.channel, a.count])
  }
  console.log(`  ${announcements.length} announcements seeded`)

  // Notifications
  const notifications = [
    { type:'lead_alert',       title:'New hot lead',         body:'Ravi Sharma (Grade 5) scored 91 — needs callback', link:'/leads' },
    { type:'fee_reminder',     title:'Overdue fees',         body:'Priya Nair has Rs.20,000 overdue since 15 Mar', link:'/fees' },
    { type:'admission_update', title:'Application admitted', body:'Arjun Pillai (Grade 4) has been admitted', link:'/admissions' },
    { type:'system',           title:'Weekly report ready',  body:'April Week 1 CRM report available in Analytics', link:'/analytics' },
  ]

  for (const n of notifications) {
    await pool.execute(`
      INSERT INTO notification_log (school_id, type, title, body, link)
      VALUES (?, ?, ?, ?, ?)
    `, [schoolId, n.type, n.title, n.body, n.link])
  }
  console.log(`  ${notifications.length} notifications seeded`)

  console.log('\n✅  Communication seed complete!')
  await pool.end()
}

seed().catch(err => {
  console.error('❌  Seed failed:', err.message)
  process.exit(1)
})