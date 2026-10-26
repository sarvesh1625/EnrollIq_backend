/**
 * EnrollIQ — attendance date ranges + percentage rules (shared by the admin and parent APIs)
 * Save as:  backend/src/utils/attendanceRange.js
 *
 * Ranges (all computed in India time, never the server's timezone):
 *   today  – one day (the `date` anchor, default today)
 *   week   – Monday to Sunday containing the anchor date
 *   month  – the calendar month containing the anchor date
 *   year   – the ACADEMIC year (1 April – 31 March) containing the anchor date
 *   custom – any from/to dates (max 366 days)
 *
 * Percentage rule (one place, so website, parent app and CSV always agree):
 *   attended = Present + Late + ½ × Half Day
 *   counted  = Present + Late + Half Day + Absent
 *   Leave (approved) and Holiday are NOT counted either way.
 */
const STATUSES = ['Present', 'Absent', 'Late', 'Half Day', 'Leave', 'Holiday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)

function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null
  return dt
}
const toYMD = (dt) => dt.toISOString().slice(0, 10)
function addDays(s, n) { const d = parseYMD(s); d.setUTCDate(d.getUTCDate() + n); return toYMD(d) }
function daysBetween(a, b) { return Math.round((parseYMD(b) - parseYMD(a)) / 86400e3) }
const pad = (n) => String(n).padStart(2, '0')
const nice = (s) => { const d = parseYMD(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }

function badRequest(message) { const e = new Error(message); e.status = 400; return e }

function resolveRange({ range = 'month', date, from, to } = {}) {
  const anchor = parseYMD(date) ? date : todayIST()
  const a = parseYMD(anchor)
  let f, t, label
  switch (range) {
    case 'today':
      f = t = anchor; label = nice(anchor); break
    case 'week': {
      const dow = (a.getUTCDay() + 6) % 7              // Monday = 0
      f = addDays(anchor, -dow); t = addDays(f, 6)
      label = `${nice(f)} – ${nice(t)}`; break
    }
    case 'month': {
      const y = a.getUTCFullYear(), m = a.getUTCMonth()
      f = `${y}-${pad(m + 1)}-01`
      t = `${y}-${pad(m + 1)}-${pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}`
      label = `${MONTHS_LONG[m]} ${y}`; break
    }
    case 'year': {
      const y = a.getUTCMonth() >= 3 ? a.getUTCFullYear() : a.getUTCFullYear() - 1
      f = `${y}-04-01`; t = `${y + 1}-03-31`
      label = `Academic year ${y}–${String(y + 1).slice(2)}`; break
    }
    case 'custom': {
      if (!parseYMD(from) || !parseYMD(to)) throw badRequest('Choose a valid From and To date')
      if (from > to) throw badRequest('"From" date must be on or before the "To" date')
      if (daysBetween(from, to) > 365) throw badRequest('Date range cannot be longer than 366 days')
      f = from; t = to; label = `${nice(f)} – ${nice(t)}`; break
    }
    default:
      throw badRequest('Invalid range. Use today, week, month, year or custom')
  }
  return { range, from: f, to: t, label, anchor }
}

// counts = { present, absent, late, half_day, leave, holiday }  →  % with 1 decimal, or null when nothing countable
function percentage(c) {
  const counted = c.present + c.late + c.half_day + c.absent
  if (!counted) return null
  return Math.round(((c.present + c.late + 0.5 * c.half_day) / counted) * 1000) / 10
}

const emptyCounts = () => ({ present: 0, absent: 0, late: 0, half_day: 0, leave: 0, holiday: 0 })
const STATUS_KEY = { 'Present': 'present', 'Absent': 'absent', 'Late': 'late', 'Half Day': 'half_day', 'Leave': 'leave', 'Holiday': 'holiday' }

// SQL fragment: per-status counts, for any query that has class_attendance aliased as ca
const AGG_SQL = `
  COALESCE(SUM(ca.status='Present'),0)  AS present,
  COALESCE(SUM(ca.status='Absent'),0)   AS absent,
  COALESCE(SUM(ca.status='Late'),0)     AS late,
  COALESCE(SUM(ca.status='Half Day'),0) AS half_day,
  COALESCE(SUM(ca.status='Leave'),0)    AS \`leave\`,
  COALESCE(SUM(ca.status='Holiday'),0)  AS holiday`

const numCounts = (r) => ({
  present: Number(r.present) || 0, absent: Number(r.absent) || 0, late: Number(r.late) || 0,
  half_day: Number(r.half_day) || 0, leave: Number(r.leave) || 0, holiday: Number(r.holiday) || 0,
})

module.exports = {
  STATUSES, STATUS_KEY, todayIST, parseYMD, toYMD, addDays, daysBetween, nice,
  resolveRange, percentage, emptyCounts, numCounts, AGG_SQL, badRequest,
}