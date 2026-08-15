/**
 * EnrollIQ — Admin Assistant (read-only, whole-school knowledge)
 * Save as:  src/controllers/assistantController.js
 *
 * Answers admin questions across ALL modules using ONLY SELECT queries.
 * Never writes. Always scoped to the admin's own school. Topic detection
 * fetches only the relevant data, then Groq phrases the answer.
 */
const { pool } = require('../db/pool')
const { resolveFeatures } = require('./featuresController')

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

async function getActiveYear() {
  const [[y]] = await pool.query('SELECT id, name FROM academic_years WHERE is_active=1 LIMIT 1')
  return y || null
}

// ---------- per-topic gatherers (all SELECT, all school-scoped) ----------

async function gLeadsAdmissions(schoolId, ayId) {
  const yl = ayId ? ' AND academic_year_id=?' : ''
  const p  = ayId ? [schoolId, ayId] : [schoolId]
  const [[lToday]] = await pool.execute(`SELECT COUNT(*) c FROM leads WHERE school_id=?${yl} AND DATE(created_at)=CURDATE()`, p)
  const [[lWeek]]  = await pool.execute(`SELECT COUNT(*) c FROM leads WHERE school_id=?${yl} AND created_at>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)`, p)
  const [[lTotal]] = await pool.execute(`SELECT COUNT(*) c FROM leads WHERE school_id=?${yl}`, p)
  const [[hot]]    = await pool.execute(`SELECT COUNT(*) c FROM leads WHERE school_id=?${yl} AND ai_label='Hot'`, p)
  const [byStatus] = await pool.execute(`SELECT status, COUNT(*) c FROM leads WHERE school_id=?${yl} GROUP BY status`, p)
  const [[admToday]] = await pool.execute(`SELECT COUNT(*) c FROM admissions WHERE school_id=?${yl} AND DATE(created_at)=CURDATE()`, p)
  const [[admMonth]] = await pool.execute(`SELECT COUNT(*) c FROM admissions WHERE school_id=?${yl} AND MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())`, p)
  const [[admTotal]] = await pool.execute(`SELECT COUNT(*) c FROM admissions WHERE school_id=?${yl}`, p)
  return {
    leads: { today:lToday.c, this_week:lWeek.c, total:lTotal.c, hot:hot.c,
             by_status: byStatus.reduce((o,r)=>(o[r.status]=r.c,o),{}) },
    admissions: { today:admToday.c, this_month:admMonth.c, total:admTotal.c },
  }
}

async function gStudents(schoolId) {
  const [[active]] = await pool.execute(`SELECT COUNT(*) c FROM students WHERE school_id=? AND (archived=0 OR archived IS NULL)`, [schoolId])
  const [[alumni]] = await pool.execute(`SELECT COUNT(*) c FROM students WHERE school_id=? AND archived=1`, [schoolId])
  const [byClass]  = await pool.execute(`SELECT class, COUNT(*) c FROM students WHERE school_id=? AND (archived=0 OR archived IS NULL) GROUP BY class ORDER BY class`, [schoolId])
  return { students: { active:active.c, alumni:alumni.c, by_class: byClass.map(r=>({class:r.class,count:r.c})) } }
}

async function gFees(schoolId, ayId) {
  const yl = ayId ? ' AND academic_year_id=?' : ''
  const p  = ayId ? [schoolId, ayId] : [schoolId]
  const [[col]] = await pool.execute(`SELECT COALESCE(SUM(paid_amount),0) t FROM payments WHERE school_id=?${yl}`, p)
  const [[pen]] = await pool.execute(`SELECT COALESCE(SUM(amount-paid_amount),0) t FROM payments WHERE school_id=?${yl} AND status IN ('Pending','Partial','Overdue')`, p)
  const [[ovd]] = await pool.execute(`SELECT COALESCE(SUM(amount-paid_amount),0) t FROM payments WHERE school_id=?${yl} AND status='Overdue'`, p)
  const [structures] = await pool.execute(`SELECT COALESCE(class_name,class) class, fee_type, amount, term FROM fee_structures WHERE school_id=? ORDER BY class_name`, [schoolId])
  return {
    fees: { collected:Number(col.t), pending:Number(pen.t), overdue:Number(ovd.t) },
    fee_structures: structures.map(s=>({ class:s.class, type:s.fee_type, amount:Number(s.amount), term:s.term })),
  }
}

async function gStaff(schoolId) {
  // Staff/teachers live in the users table (each with a role). This is what the
  // Roles page shows. Exclude nothing — list everyone with a role.
  const [staff] = await pool.execute(
    `SELECT name, email, role FROM users WHERE school_id=? ORDER BY role, name`, [schoolId])
  const [byRole] = await pool.execute(
    `SELECT role, COUNT(*) c FROM users WHERE school_id=? GROUP BY role`, [schoolId])
  // public-facing faculty (optional, separate from staff accounts)
  const [faculty] = await pool.execute(
    `SELECT name, role FROM school_faculty WHERE school_id=? AND is_active=1`, [schoolId]).catch(()=>[[]])

  const roleLabel = { admin:'Admin', staff:'Staff', teacher:'Teacher', accountant:'Accountant',
    receptionist:'Receptionist', transport_manager:'Transport Manager' }
  return {
    staff: staff.map(s=>({ name:s.name, email:s.email, role: roleLabel[s.role] || s.role })),
    staff_count: staff.length,
    staff_by_role: byRole.reduce((o,r)=>(o[roleLabel[r.role]||r.role]=r.c,o),{}),
    public_faculty: (faculty||[]).map(f=>({ name:f.name, role:f.role })),
  }
}

async function gTransport(schoolId) {
  const [buses]   = await pool.execute(`SELECT bus_number, plate_number, capacity, status FROM buses WHERE school_id=?`, [schoolId])
  const [drivers] = await pool.execute(`SELECT name, phone, status FROM drivers WHERE school_id=?`, [schoolId])
  const [routes]  = await pool.execute(`SELECT route_name, route_type, start_time, end_time, status FROM transport_routes WHERE school_id=?`, [schoolId])
  const [[enrolled]] = await pool.execute(`SELECT COUNT(*) c FROM student_transport WHERE school_id=?`, [schoolId])
  return {
    transport: {
      buses: buses.map(b=>({ number:b.bus_number, plate:b.plate_number, capacity:b.capacity, status:b.status })),
      bus_count: buses.length,
      drivers: drivers.map(d=>({ name:d.name, phone:d.phone, status:d.status })),
      driver_count: drivers.length,
      routes: routes.map(r=>({ name:r.route_name, type:r.route_type, start:r.start_time, end:r.end_time })),
      route_count: routes.length,
      students_enrolled: enrolled.c,
    }
  }
}

async function gExams(schoolId, ayId) {
  const yl = ayId ? ' AND academic_year_id=?' : ''
  const p  = ayId ? [schoolId, ayId] : [schoolId]
  const [exams]    = await pool.execute(`SELECT name, class_name, exam_type, start_date, end_date, status FROM exams WHERE school_id=?${yl} ORDER BY start_date DESC`, p)
  const [subjects] = await pool.execute(`SELECT name, class_name, max_marks FROM subjects WHERE school_id=?`, [schoolId])
  return {
    exams: exams.map(e=>({ name:e.name, class:e.class_name, type:e.exam_type, start:e.start_date, status:e.status })),
    exam_count: exams.length,
    subjects: subjects.map(s=>({ name:s.name, class:s.class_name, max_marks:s.max_marks })),
  }
}

async function gAttendance(schoolId, ayId) {
  const yl = ayId ? ' AND academic_year_id=?' : ''
  const p  = ayId ? [schoolId, ayId] : [schoolId]
  const [[today]] = await pool.execute(`SELECT COUNT(*) total, SUM(status='Present') present FROM class_attendance WHERE school_id=?${yl} AND date=CURDATE()`, p)
  const [[overall]] = await pool.execute(`SELECT COUNT(*) total, SUM(status='Present') present FROM class_attendance WHERE school_id=?${yl}`, p)
  return {
    attendance: {
      today: { marked: today.total, present: Number(today.present||0) },
      overall_present_percent: overall.total ? Math.round((overall.present/overall.total)*100) : null,
    }
  }
}

async function gCommunication(schoolId) {
  const [anns] = await pool.execute(`SELECT title, audience, sent_at, status FROM announcements WHERE school_id=? ORDER BY created_at DESC LIMIT 5`, [schoolId])
  const [[msgCount]] = await pool.execute(`SELECT COUNT(*) c FROM messages WHERE school_id=?`, [schoolId])
  return {
    recent_announcements: anns.map(a=>({ title:a.title, audience:a.audience, status:a.status })),
    total_messages_sent: msgCount.c,
  }
}

// student lookup by name (full profile)
async function gStudentByName(schoolId, nameQuery) {
  const [rows] = await pool.execute(
    `SELECT id, roll_number, name, class, section, status, archived, exit_type,
            parent_name, parent_phone, parent_email, dob
     FROM students WHERE school_id=? AND name LIKE ? ORDER BY name LIMIT 8`,
    [schoolId, `%${nameQuery}%`])
  const out = []
  for (const s of rows) {
    const [[att]] = await pool.execute(`SELECT COUNT(*) total, SUM(status='Present') present FROM class_attendance WHERE student_id=?`, [s.id])
    const [[fee]] = await pool.execute(`SELECT COALESCE(SUM(paid_amount),0) paid, COALESCE(SUM(amount-paid_amount),0) due FROM payments WHERE student_id=?`, [s.id])
    const [marks] = await pool.execute(
      `SELECT e.name exam, sub.name subject, em.marks, em.max_marks
       FROM exam_marks em
       JOIN exams e ON e.id=em.exam_id
       LEFT JOIN subjects sub ON sub.id=em.subject_id
       WHERE em.student_id=? ORDER BY em.id DESC LIMIT 6`, [s.id]).catch(()=>[[]])
    out.push({
      name:s.name, roll_number:s.roll_number, class:s.class, section:s.section,
      status: s.archived ? `Exited (${s.exit_type||'archived'})` : s.status,
      parent:s.parent_name, parent_phone:s.parent_phone,
      attendance_percent: att.total ? Math.round((att.present/att.total)*100) : null,
      fees_paid:Number(fee.paid), fees_due:Number(fee.due),
      exam_results: marks || [],
    })
  }
  return out
}

// ---------- topic detection ----------
function detectTopics(q) {
  const s = q.toLowerCase()
  const topics = new Set()
  if (/lead|enquir|admission|pipeline|convert/.test(s)) topics.add('leads')
  if (/student|enroll|pupil|child/.test(s))            topics.add('students')
  if (/fee|payment|money|collect|due|overdue|price|amount/.test(s)) topics.add('fees')
  if (/staff|teacher|faculty|employee|principal/.test(s)) topics.add('staff')
  if (/bus|transport|driver|route|vehicle/.test(s))    topics.add('transport')
  if (/exam|test|mark|subject|result|grade/.test(s))   topics.add('exams')
  if (/attend|present|absent/.test(s))                 topics.add('attendance')
  if (/message|announce|notif|communicat/.test(s))     topics.add('communication')
  if (/today|happen|summary|overview|going on|what.s new/.test(s)) { topics.add('leads'); topics.add('fees') }
  return topics
}

function extractStudentName(q) {
  const m = q.match(/(?:about|how is|how's|student|details of|info on|profile of|show me|tell me about)\s+([a-zA-Z][a-zA-Z .]{1,30})/i)
  if (m) {
    let name = m[1].trim().replace(/\b(doing|going|performing|is|the|student|details|profile)\b/gi,'').trim()
    if (name.length >= 2) return name
  }
  return null
}

async function callGroq(system, user) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')
  const resp = await fetch(GROQ_URL, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model:GROQ_MODEL, temperature:0.3,
      messages:[{role:'system',content:system},{role:'user',content:user}] }),
  })
  if (!resp.ok) { const t = await resp.text(); throw new Error(`Groq API error ${resp.status}: ${t.slice(0,200)}`) }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content?.trim() || 'Sorry, I could not generate an answer.'
}

async function ask(req, res, next) {
  try {
    const schoolId = req.user.school_id
    // feature gate: this school's plan must include the AI assistant
    try {
      const { features } = await resolveFeatures(schoolId)
      if (!features.ai_assistant) {
        return res.status(403).json({ message: 'The AI Assistant is not included in your current plan.', gated: true })
      }
    } catch (e) { /* if the features table isn't set up yet, fail open so nothing breaks */ }

    const question = (req.body.question || '').trim()
    if (!question) return res.status(400).json({ message:'question is required' })

    const ay = await getActiveYear()
    const ayId = ay ? ay.id : null

    const context = { academic_year: ay ? ay.name : 'n/a' }

    // student-specific?
    const studentName = extractStudentName(question)
    if (studentName) {
      try { context.student_lookup = { query: studentName, matches: await gStudentByName(schoolId, studentName) } }
      catch (e) { console.error('student lookup error:', e.message) }
    }

    // topic data (fetch only what's relevant; default to a broad summary)
    let topics = detectTopics(question)
    if (topics.size === 0 && !studentName) { topics = new Set(['leads','students','fees']) }

    const safe = async (fn) => { try { return await fn() } catch (e) { console.error('assistant gather error:', e.message); return {} } }
    if (topics.has('leads'))         Object.assign(context, await safe(()=>gLeadsAdmissions(schoolId, ayId)))
    if (topics.has('students'))      Object.assign(context, await safe(()=>gStudents(schoolId)))
    if (topics.has('fees'))          Object.assign(context, await safe(()=>gFees(schoolId, ayId)))
    if (topics.has('staff'))         Object.assign(context, await safe(()=>gStaff(schoolId)))
    if (topics.has('transport'))     Object.assign(context, await safe(()=>gTransport(schoolId)))
    if (topics.has('exams'))         Object.assign(context, await safe(()=>gExams(schoolId, ayId)))
    if (topics.has('attendance'))    Object.assign(context, await safe(()=>gAttendance(schoolId, ayId)))
    if (topics.has('communication')) Object.assign(context, await safe(()=>gCommunication(schoolId)))

    const system = [
      'You are EnrollIQ Assistant, a helpful READ-ONLY assistant for a school admin.',
      'Answer ONLY from the DATA provided in JSON. Never invent numbers or facts.',
      'If a value is 0 or the data is missing/empty, say so plainly and honestly.',
      'Be concise and friendly. Use the ₹ symbol for money.',
      'When listing students, staff, buses etc., format them clearly (short lines or bullets).',
      'You cannot change any data — you only report what is in the database.',
    ].join(' ')

    const user = [
      `Admin question: "${question}"`,
      `DATA (JSON): ${JSON.stringify(context)}`,
      'Answer using ONLY this data.',
    ].join('\n')

    const answer = await callGroq(system, user)
    res.json({ answer })
  } catch (err) {
    if (String(err.message).includes('Groq')) {
      return res.status(200).json({ answer:'The AI service is temporarily unavailable. Please try again shortly.', error:true })
    }
    next(err)
  }
}

module.exports = { ask }