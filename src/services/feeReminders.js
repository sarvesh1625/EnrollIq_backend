/**
 * EnrollIQ - Automatic fee reminders to the parent app
 *
 * Stages (per fee row):
 *   before3   : due in 1-3 days            -> sent once
 *   due_today : due today                  -> sent once
 *   overdue   : past due                   -> sent on the first run, then every 7 days
 * Fee rows of the same student and stage are combined into ONE notification.
 * fee_reminder_log (unique payment+stage+day) stops duplicates, even if two servers run the job.
 */
const { pool } = require('../db/pool')
const { notifyParent } = require('./notificationService')

const OVERDUE_REPEAT_DAYS = 7
const OVERDUE_MAX_DAYS    = 90     // stop nagging after ~3 months; the office should follow up by hand

function todayIST() {
  // YYYY-MM-DD in India time, whatever the server clock says
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}
function daysBetween(fromYmd, toYmd) {   // to - from, in whole days
  return Math.round((Date.parse(toYmd + 'T00:00:00Z') - Date.parse(fromYmd + 'T00:00:00Z')) / 86400000)
}
function ymd(d) {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)
}
const rupees = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const niceDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// Pure decision: which stage (if any) should this fee row get today?
// lastOverdueSent = 'YYYY-MM-DD' of the previous overdue reminder, or null
function decideStage(dueYmd, today, { sentStages = [], lastOverdueSent = null } = {}) {
  const diff = daysBetween(today, dueYmd)           // >0 future, 0 today, <0 past
  if (diff > 3) return null
  if (diff > 0)  return sentStages.includes('before3') ? null : 'before3'
  if (diff === 0) return sentStages.includes('due_today') ? null : 'due_today'
  if (-diff > OVERDUE_MAX_DAYS) return null
  if (!lastOverdueSent) return 'overdue'
  return daysBetween(lastOverdueSent, today) >= OVERDUE_REPEAT_DAYS ? 'overdue' : null
}

function buildMessage(stage, studentName, items, today) {
  const total = items.reduce((a, i) => a + i.balance, 0)
  const names = [...new Set(items.map(i => i.fee_type || 'Fee'))].join(', ')
  const earliest = items.map(i => i.due).sort()[0]
  if (stage === 'before3')
    return { title: `Fee due soon: ${rupees(total)}`,
             body: `${studentName}: ${names} of ${rupees(total)} is due on ${niceDate(earliest)}. Please pay on time to avoid a late fee.` }
  if (stage === 'due_today')
    return { title: `Fee due today: ${rupees(total)}`,
             body: `${studentName}: ${names} of ${rupees(total)} is due today. Please pay at the school office.` }
  const late = daysBetween(earliest, today)
  return { title: `Fee overdue: ${rupees(total)}`,
           body: `${studentName}: ${names} of ${rupees(total)} was due on ${niceDate(earliest)} (${late} day${late === 1 ? '' : 's'} ago). Please clear it at the earliest or contact the school office.` }
}

/**
 * Run for one school (or all schools when schoolId is null).
 * dryRun = true: report what WOULD be sent, write nothing.
 */
async function runFeeReminders({ schoolId = null, dryRun = false } = {}) {
  const today = todayIST()

  // keep statuses honest (index of the Fees page does the same, but only when someone opens it)
  if (!dryRun) {
    await pool.execute(
      `UPDATE payments SET status='Overdue' WHERE status='Pending' AND due_date < ? ${schoolId ? 'AND school_id = ?' : ''}`,
      schoolId ? [today, schoolId] : [today])
  }

  const [rows] = await pool.execute(
    `SELECT p.id, p.school_id, p.student_id, p.fee_type, p.amount, p.paid_amount, p.due_date,
            s.name AS student_name, s.parent_phone
     FROM payments p
     JOIN students s ON s.id = p.student_id
     WHERE p.status IN ('Pending','Partial','Overdue')
       AND p.amount > COALESCE(p.paid_amount,0)
       AND p.due_date IS NOT NULL
       AND p.due_date <= DATE_ADD(?, INTERVAL 3 DAY)
       AND s.status = 'Active'
       AND s.parent_phone IS NOT NULL AND s.parent_phone <> ''
       ${schoolId ? 'AND p.school_id = ?' : ''}`,
    schoolId ? [today, schoolId] : [today])

  const summary = { date: today, candidates: rows.length, notifications: 0, fee_rows: 0, preview: [] }
  if (!rows.length) return summary

  // what was already sent for these rows
  const ids = rows.map(r => r.id)
  const [logs] = await pool.query(
    `SELECT payment_id, stage, MAX(sent_on) AS last_sent FROM fee_reminder_log WHERE payment_id IN (?) GROUP BY payment_id, stage`, [ids])
  const logMap = {}
  logs.forEach(l => {
    const m = (logMap[l.payment_id] = logMap[l.payment_id] || { stages: [], lastOverdue: null })
    m.stages.push(l.stage)
    if (l.stage === 'overdue') m.lastOverdue = ymd(l.last_sent)
  })

  // group by student + stage
  const groups = {}
  for (const r of rows) {
    const due = ymd(r.due_date)
    const m = logMap[r.id] || { stages: [], lastOverdue: null }
    const stage = decideStage(due, today, { sentStages: m.stages, lastOverdueSent: m.lastOverdue })
    if (!stage) continue
    const key = `${r.school_id}|${r.student_id}|${stage}`
    const g = (groups[key] = groups[key] || { schoolId: r.school_id, studentId: r.student_id, studentName: r.student_name, phone: r.parent_phone, stage, items: [] })
    g.items.push({ payment_id: r.id, fee_type: r.fee_type, due, balance: Number(r.amount) - Number(r.paid_amount || 0) })
  }

  for (const g of Object.values(groups)) {
    const msg = buildMessage(g.stage, g.studentName, g.items, today)
    if (dryRun) {
      summary.notifications++; summary.fee_rows += g.items.length
      if (summary.preview.length < 50) summary.preview.push({ student: g.studentName, stage: g.stage, title: msg.title, body: msg.body })
      continue
    }
    // claim first (unique key): if another run already claimed these rows, INSERT IGNORE adds nothing
    let claimed = 0
    for (const it of g.items) {
      const [r] = await pool.execute(
        `INSERT IGNORE INTO fee_reminder_log (school_id, payment_id, student_id, stage, sent_on) VALUES (?,?,?,?,?)`,
        [g.schoolId, it.payment_id, g.studentId, g.stage, today])
      claimed += r.affectedRows
    }
    if (!claimed) continue
    const ok = await notifyParent({ schoolId: g.schoolId, studentId: g.studentId, parentPhone: g.phone,
      type: 'fee', title: msg.title, body: msg.body, link: 'fees' })
    if (!ok) {   // release the claim so the next run retries
      await pool.query(`DELETE FROM fee_reminder_log WHERE payment_id IN (?) AND stage = ? AND sent_on = ?`,
        [g.items.map(i => i.payment_id), g.stage, today])
      continue
    }
    summary.notifications++; summary.fee_rows += g.items.length
  }
  return summary
}

// Scheduler: checks every 30 minutes, runs between 9:00 and 19:00 India time.
// Safe to run many times a day: the log prevents repeats.
function startFeeReminderScheduler() {
  // OFF unless you switch it on. A developer machine that shares the live database must never send
  // real reminders by accident. On the live server set FEE_REMINDERS=on in the environment.
  if (String(process.env.FEE_REMINDERS || 'off').toLowerCase() !== 'on') {
    console.log('Fee reminders: scheduler is OFF (set FEE_REMINDERS=on on the live server to enable)')
    return
  }
  const hourIST = () => parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()), 10)
  let running = false
  const tick = async () => {
    const h = hourIST()
    if (running || h < 9 || h >= 19) return
    running = true
    try {
      const r = await runFeeReminders({})
      if (r.notifications) console.log(`Fee reminders: sent ${r.notifications} notification(s) for ${r.fee_rows} fee row(s)`)
    } catch (e) { console.error('Fee reminders failed:', e.message) }
    finally { running = false }
  }
  setTimeout(tick, 60 * 1000)               // first check one minute after start
  setInterval(tick, 30 * 60 * 1000)
  console.log('Fee reminders: scheduler on (daily window 09:00-19:00 IST)')
}

module.exports = { runFeeReminders, startFeeReminderScheduler, decideStage, buildMessage, todayIST }