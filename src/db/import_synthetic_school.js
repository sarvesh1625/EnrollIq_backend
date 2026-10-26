/**
 * EnrollIQ — import the "15 Year Synthetic School Data" CSV pack into ONE school
 * ------------------------------------------------------------------------------
 * Save as:  backend/src/db/import_synthetic_school.js
 *
 * 1) Unzip Enroll_IQ_15_Year_Synthetic_School_Data.zip into a folder (e.g. C:\data\school15).
 * 2) From the backend folder:
 *
 *    Preview only (writes nothing):
 *      node src/db/import_synthetic_school.js --data "C:\data\school15" --branch BR01 --dry-run
 *
 *    Real import into a NEW demo school (recommended):
 *      node src/db/import_synthetic_school.js --data "C:\data\school15" --branch BR01 --yes
 *
 *    Import into a school you already created (e.g. from the Super Admin page):
 *      node src/db/import_synthetic_school.js --data "C:\data\school15" --school-id 12 --yes
 *
 *    Remove everything again (only works on a school named "... (synthetic)"):
 *      node src/db/import_synthetic_school.js --undo --school-id 12 --yes
 *
 * Options
 *   --branch BR01|BR02|...|ALL   which of the 5 branches to load (default ALL = all branches merged into the one school)
 *   --history                    also load past years' class history + fees + older leads (creates the missing
 *                                academic years — the year list is shared by every school, so only use this on a test system)
 *   --skip leads,fees,enrollments   leave out parts
 *   --allow-non-empty            allow --school-id of a school that already has students (default: refuse)
 *   --yes                        required for any real write to a database that is not on this computer
 *
 * What is imported  : students (+ parent details), this year's class/section/roll, fee instalments, admission leads.
 * What is NOT       : monthly attendance, exam marks, staff, transport routes, message logs — they do not fit the
 *                     current tables (attendance is daily here, marks hang off exams/subjects). See the hand-off notes.
 * Safe to re-run    : already-imported students / leads / fee rows are skipped.
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { pool } = require('./pool')

/* ───────────── args ───────────── */
const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const val = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const DATA = val('data')
const BRANCH = (val('branch', 'ALL') || 'ALL').toUpperCase()
const SCHOOL_ID = val('school-id') ? Number(val('school-id')) : null
const SKIP = new Set((val('skip', '') || '').split(',').map(s => s.trim()).filter(Boolean))
const DRY = flag('dry-run')
const HISTORY = flag('history')
const SUFFIX = ' (synthetic)'
const BATCH = 1000
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)   // today in India

const log = (...a) => console.log(...a)
const die = (m) => { console.error('\n❌  ' + m + '\n'); process.exit(1) }

/* ───────────── csv helpers ───────────── */
function splitLine(line) {
  if (!line.includes('"')) return line.split(',')
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out
}
async function* rows(file) {
  const p = path.join(DATA, file)
  if (!fs.existsSync(p)) die(`Cannot find ${file} in ${DATA}`)
  const rl = readline.createInterface({ input: fs.createReadStream(p, { encoding: 'utf8' }), crlfDelay: Infinity })
  let head = null
  for await (let line of rl) {
    if (head === null) { head = splitLine(line.replace(/^\uFEFF/, '')).map(s => s.trim()); continue }
    if (!line) continue
    const f = splitLine(line); const o = {}
    for (let i = 0; i < head.length; i++) o[head[i]] = f[i] === undefined ? '' : f[i].trim()
    yield o
  }
}
async function readAll(file, filter) { const a = []; for await (const r of rows(file)) if (!filter || filter(r)) a.push(r); return a }

const colsCache = {}
async function cols(table) {
  if (!colsCache[table]) {
    const [r] = await pool.query(`SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [table])
    colsCache[table] = new Set(r.map(x => x.c))
  }
  return colsCache[table]
}
async function insertBatches(table, columns, data, label) {
  let n = 0
  for (let i = 0; i < data.length; i += BATCH) {
    const chunk = data.slice(i, i + BATCH)
    await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ?`, [chunk])
    n += chunk.length
    if (data.length > BATCH * 6 && (n % (BATCH * 10) === 0 || n === data.length)) process.stdout.write(`\r     ${label}: ${n.toLocaleString()} / ${data.length.toLocaleString()}   `)
  }
  if (data.length > BATCH * 6) process.stdout.write('\n')
  return n
}
const gradeName = (g) => 'Grade ' + String(g).trim()
const labelFor = (s) => (s >= 75 ? 'Hot' : s >= 55 ? 'Warm' : 'Cold')
const leadStatus = (s) => ({ Admitted: 'Admission', Lost: 'Lost', New: 'New', Contacted: 'Contacted', Visited: 'Campus Visit', 'Visit Scheduled': 'Campus Visit', Application: 'Campus Visit' }[s] || 'New')
// June 1 starts a school year: 2026-06-15 → "2026-27"
function yearNameOf(dateStr) {
  const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7))
  const s = m >= 6 ? y : y - 1
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`
}

/* ───────────── safety checks ───────────── */
function dbBanner() {
  const host = process.env.DB_HOST || 'localhost', name = process.env.DB_NAME || '(default)'
  const remote = !['localhost', '127.0.0.1', '::1'].includes(host)
  log(`\n🗄️   Database: ${name}  on  ${host}${remote ? '   ⚠ REMOTE / LIVE server' : ''}`)
  return remote
}

/* ───────────── undo ───────────── */
async function undo() {
  if (!SCHOOL_ID) die('--undo needs --school-id')
  const [[s]] = await pool.query('SELECT id, name FROM schools WHERE id=?', [SCHOOL_ID])
  if (!s) die(`School ${SCHOOL_ID} not found`)
  if (!s.name.endsWith(SUFFIX)) die(`Refusing: "${s.name}" is not a synthetic test school (its name must end with "${SUFFIX.trim()}"). Nothing was deleted.`)
  const counts = {}
  for (const t of ['payments', 'leads', 'students']) {
    const [[c]] = await pool.query(`SELECT COUNT(*) n FROM ${t} WHERE school_id=?`, [SCHOOL_ID]); counts[t] = c.n
  }
  log(`\nWill delete from "${s.name}" (id ${s.id}): ${counts.students} students, ${counts.payments} fee rows, ${counts.leads} leads, its logins, and the school itself.`)
  if (DRY) { log('Dry run — nothing deleted.'); return }
  if (!flag('yes')) die('Add --yes to confirm the delete.')
  const del = async (sql, p) => { try { const [r] = await pool.query(sql, p); return r.affectedRows } catch (e) { log('   skipped:', e.message.slice(0, 90)); return 0 } }
  await del('DELETE FROM payments WHERE school_id=?', [SCHOOL_ID])
  await del('DELETE FROM student_enrollments WHERE student_id IN (SELECT id FROM students WHERE school_id=?)', [SCHOOL_ID])
  await del('DELETE FROM leads WHERE school_id=?', [SCHOOL_ID])
  await del('DELETE FROM students WHERE school_id=?', [SCHOOL_ID])
  await del('DELETE FROM users WHERE school_id=?', [SCHOOL_ID])
  const gone = await del('DELETE FROM schools WHERE id=?', [SCHOOL_ID])
  log(gone ? '\n✅  Removed.' : '\n⚠  Rows were removed but the school itself is still referenced elsewhere (e.g. attendance or messages added after the import). Tell me and I will clear those too.')
}

/* ───────────── import ───────────── */
async function run() {
  if (flag('undo')) { dbBanner(); await undo(); return }
  if (!DATA) die('Missing --data "<folder with the CSV files>"')
  if (!fs.existsSync(path.join(DATA, 'students.csv'))) die(`students.csv not found in ${DATA} — unzip the pack first and point --data at that folder`)
  const remote = dbBanner()
  if (!DRY && remote && !flag('yes')) die('This would WRITE to a remote database. Run again with --dry-run to preview, or add --yes to go ahead.')
  log(`📦  Source: ${DATA}\n🏫  Branch scope: ${BRANCH}   ·   history: ${HISTORY ? 'ALL years' : 'current year only'}   ·   ${DRY ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`)

  const sCols = await cols('students'), pCols = await cols('payments'), lCols = await cols('leads')
  const eCols = await cols('student_enrollments'), yCols = await cols('academic_years')
  if (!sCols.size || !yCols.size || !eCols.size) die('Tables students / academic_years / student_enrollments are missing — run the academic-year migration first (node src/db/migrate_academic_year.js).')

  /* — read the small reference files — */
  const branches = Object.fromEntries((await readAll('branches.csv')).map(b => [b.branch_id, b]))
  const years = await readAll('academic_years.csv')
  const activeY = years.find(y => y.status === 'ACTIVE') || years[years.length - 1]
  const inBranch = (b) => BRANCH === 'ALL' || b === BRANCH
  if (BRANCH !== 'ALL' && !branches[BRANCH]) die(`Unknown branch ${BRANCH}. Use one of: ${Object.keys(branches).join(', ')} or ALL`)

  /* — which students: those enrolled in the ACTIVE year within the branch scope — */
  const curEnr = new Map()                                   // student_id -> enrollment row (active year)
  for await (const e of rows('student_enrollments.csv'))
    if (e.academic_year_id === activeY.academic_year_id && e.status === 'ACTIVE' && inBranch(e.branch_id)) curEnr.set(e.student_id, e)
  if (!curEnr.size) die('No active students found for that branch.')
  const stu = new Map()
  for await (const s of rows('students.csv')) if (curEnr.has(s.student_id)) stu.set(s.student_id, s)
  const guard = new Map()
  for await (const g of rows('guardians.csv')) if (stu.has(g.student_id)) guard.set(g.student_id, g)
  log(`🔎  Found ${stu.size.toLocaleString()} active students${BRANCH === 'ALL' ? ' across ' + new Set([...curEnr.values()].map(e => e.branch_id)).size + ' branches' : ' in ' + branches[BRANCH].branch_name}`)

  /* — school — */
  let schoolId = SCHOOL_ID, adminLogin = null
  if (schoolId) {
    const [[sc]] = await pool.query('SELECT id, name FROM schools WHERE id=?', [schoolId])
    if (!sc) die(`School ${schoolId} does not exist.`)
    const [[c]] = await pool.query('SELECT COUNT(*) n FROM students WHERE school_id=?', [schoolId])
    if (c.n > 0 && !flag('allow-non-empty')) die(`"${sc.name}" already has ${c.n} students. Importing into it would mix test data with real data. Use a new school (leave out --school-id) or add --allow-non-empty if you are sure.`)
    log(`🏫  Importing into existing school: "${sc.name}" (id ${schoolId})`)
  } else if (DRY) {
    log('🏫  (dry run) would create a new school "Enroll IQ Demo School' + SUFFIX + '" with an admin login')
  } else {
    const sc = await cols('schools')
    const base = { name: 'Enroll IQ Demo School' + SUFFIX, city: BRANCH === 'ALL' ? 'Warangal' : branches[BRANCH].city, board: 'CBSE', email: null,
                   subscription_plan: 'enterprise', subscription_status: 'Active', status: 'Active', is_active: 1 }
    const keys = Object.keys(base).filter(k => sc.has(k))
    const [r] = await pool.query(`INSERT INTO schools (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(k => base[k]))
    schoolId = r.insertId
    const pw = 'Demo-' + crypto.randomBytes(5).toString('hex')
    const email = `demo.admin${schoolId}@enrolliq.test`
    const uKeys = ['school_id', 'name', 'email', 'password_hash', 'role', 'is_active']
    await pool.query(`INSERT INTO users (${uKeys.join(',')}) VALUES (?,?,?,?,?,?)`, [schoolId, 'Demo Admin', email, await bcrypt.hash(pw, 10), 'admin', 1])
    adminLogin = { email, pw }
    log(`🏫  Created school "Enroll IQ Demo School${SUFFIX}" (id ${schoolId})`)
  }

  /* — academic years (shared across all schools!) — */
  const [dbYears] = await pool.query('SELECT * FROM academic_years')
  const yearIdByName = new Map(dbYears.map(y => [y.name, y.id]))
  const dbActive = dbYears.find(y => y.is_active)
  const ayName = new Map(years.map(y => [y.academic_year_id, y.name]))
  async function ensureYear(name) {
    if (yearIdByName.has(name)) return yearIdByName.get(name)
    const y = years.find(z => z.name === name)
    if (DRY) { yearIdByName.set(name, -1); return -1 }
    const k = ['name'], v = [name]
    const startYear = Number(name.slice(0, 4))                             // e.g. "2010-11" → 2010-06-01 … 2011-04-30
    if (yCols.has('start_date')) { k.push('start_date'); v.push(y ? y.start_date : `${startYear}-06-01`) }
    if (yCols.has('end_date')) { k.push('end_date'); v.push(y ? y.end_date : `${startYear + 1}-04-30`) }
    if (yCols.has('is_active')) { k.push('is_active'); v.push(0) }
    if (yCols.has('is_closed')) { k.push('is_closed'); v.push(name === ayName.get(activeY.academic_year_id) ? 0 : 1) }
    const [r] = await pool.query(`INSERT INTO academic_years (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, v)
    yearIdByName.set(name, r.insertId); return r.insertId
  }
  const curName = ayName.get(activeY.academic_year_id)
  const curYearId = await ensureYear(curName)
  if (dbActive && dbActive.name !== curName)
    log(`⚠   Your website's ACTIVE academic year is ${dbActive.name}, but the data's current year is ${curName}. The students will import fine, but pages that filter by the active year will show them only after you switch the active year to ${curName}.`)

  /* — students — */
  const summary = {}
  const [exist] = schoolId ? await pool.query('SELECT id, roll_number FROM students WHERE school_id=?', [schoolId]) : [[]]
  const idByAdm = new Map(exist.map(x => [x.roll_number, x.id]))
  const newStu = []
  for (const [sid, s] of stu) {
    if (idByAdm.has(s.admission_no)) continue
    const e = curEnr.get(sid), g = guard.get(sid) || {}
    const rec = {
      school_id: schoolId, roll_number: s.admission_no, name: `${s.first_name} ${s.last_name}`.trim(), class: gradeName(e.grade), section: e.section,
      dob: s.dob || null, parent_name: g.guardian_name || null, parent_phone: g.phone || null, parent_email: g.email || null,
      area: g.city || branches[e.branch_id]?.city || null, status: 'Active', created_at: `${s.admission_year}-06-01 09:00:00`,
    }
    newStu.push(rec)
  }
  const sKeys = ['school_id', 'roll_number', 'name', 'class', 'section', 'dob', 'parent_name', 'parent_phone', 'parent_email', 'area', 'status', 'created_at'].filter(k => sCols.has(k))
  summary.students = { new: newStu.length, skipped: stu.size - newStu.length }
  log(`👩‍🎓  Students: ${newStu.length.toLocaleString()} to add, ${summary.students.skipped.toLocaleString()} already there`)
  if (!DRY && newStu.length) await insertBatches('students', sKeys, newStu.map(r => sKeys.map(k => r[k])), 'students')

  if (!DRY) { const [all] = await pool.query('SELECT id, roll_number FROM students WHERE school_id=?', [schoolId]); all.forEach(x => idByAdm.set(x.roll_number, x.id)) }
  const dbId = (sid) => idByAdm.get(stu.get(sid)?.admission_no)

  /* — class history (student_enrollments) — */
  if (!SKIP.has('enrollments')) {
    const wantYear = (ayId) => HISTORY || ayId === activeY.academic_year_id
    const enrRows = []; const enrByEid = new Map()
    for await (const e of rows('student_enrollments.csv')) {
      if (!stu.has(e.student_id) || !wantYear(e.academic_year_id)) continue
      enrByEid.set(e.enrollment_id, e)
      enrRows.push(e)
    }
    // year ids (creates past years only with --history)
    const yIds = {}; for (const ay of new Set(enrRows.map(e => e.academic_year_id))) yIds[ay] = await ensureYear(ayName.get(ay))
    let have = new Set()
    if (!DRY) { const [h] = await pool.query('SELECT student_id, academic_year_id FROM student_enrollments WHERE student_id IN (SELECT id FROM students WHERE school_id=?)', [schoolId]); have = new Set(h.map(x => x.student_id + ':' + x.academic_year_id)) }
    const eKeys = ['student_id', 'academic_year_id', 'class', 'section', 'roll_number', 'status'].filter(k => eCols.has(k))
    const out = []
    for (const e of enrRows) {
      const id = dbId(e.student_id); if (!id && !DRY) continue
      if (have.has(id + ':' + yIds[e.academic_year_id])) continue
      const st = e.status === 'ACTIVE' ? 'Active' : 'Promoted'
      const rec = { student_id: id, academic_year_id: yIds[e.academic_year_id], class: gradeName(e.grade), section: e.section, roll_number: e.roll_no, status: st }
      out.push(eKeys.map(k => rec[k]))
    }
    summary.enrollments = out.length
    log(`📚  Class history rows: ${out.length.toLocaleString()} to add`)
    if (!DRY && out.length) await insertBatches('student_enrollments', eKeys, out, 'class history')
  }

  /* — fees → payments — */
  if (!SKIP.has('fees')) {
    const wantYear = (ayId) => HISTORY || ayId === activeY.academic_year_id
    const have = new Set()
    if (!DRY && pCols.has('reference_no')) { const [h] = await pool.query('SELECT reference_no FROM payments WHERE school_id=? AND reference_no LIKE ?', [schoolId, 'FEE%']); h.forEach(x => have.add(x.reference_no)) }
    const pKeys = ['school_id', 'student_id', 'fee_type', 'amount', 'paid_amount', 'due_date', 'paid_date', 'payment_mode', 'status', 'reference_no', 'academic_year_id'].filter(k => pCols.has(k))
    let buf = [], total = 0, paid = 0, pending = 0, skipped = 0
    let written = 0
    const flush = async () => { if (buf.length && !DRY) { await insertBatches('payments', pKeys, buf, 'fees'); written += buf.length; process.stdout.write(`\r     fees: ${written.toLocaleString()} rows written   `) } buf = [] }
    const yCache = {}
    for await (const f of rows('fee_transactions.csv')) {
      if (!stu.has(f.student_id) || !wantYear(f.academic_year_id)) continue
      if (have.has(f.fee_txn_id)) { skipped++; continue }
      const id = dbId(f.student_id); if (!id && !DRY) continue
      const amt = Number(f.amount_paid)
      const isPaid = f.payment_date && f.payment_date <= TODAY            // an instalment dated in the future is still due
      const ayId = yCache[f.academic_year_id] ??= await ensureYear(ayName.get(f.academic_year_id))
      const rec = { school_id: schoolId, student_id: id, fee_type: `Tuition Fee – Instalment ${f.installment_no}`, amount: amt, paid_amount: isPaid ? amt : 0,
                    due_date: f.payment_date || null, paid_date: isPaid ? f.payment_date : null, payment_mode: isPaid ? f.payment_mode : null,
                    status: isPaid ? 'Paid' : 'Pending', reference_no: f.fee_txn_id, academic_year_id: ayId }
      isPaid ? paid++ : pending++; total++
      buf.push(pKeys.map(k => rec[k]))
      if (buf.length >= BATCH * 5) await flush()
    }
    await flush()
    if (written) process.stdout.write('\n')
    summary.fees = { total, paid, pending, skipped }
    log(`💰  Fee instalments: ${total.toLocaleString()} to add  (${paid.toLocaleString()} paid, ${pending.toLocaleString()} still due because their date is in the future)${skipped ? `, ${skipped.toLocaleString()} already there` : ''}`)
  }

  /* — leads — */
  if (!SKIP.has('leads')) {
    const have = new Set()
    if (!DRY) { const [h] = await pool.query(`SELECT notes FROM leads WHERE school_id=? AND notes LIKE 'Imported LEAD%'`, [schoolId]); h.forEach(x => have.add(x.notes.replace('Imported ', ''))) }
    const lKeys = ['school_id', 'parent_name', 'phone', 'child_grade', 'area', 'lead_source', 'notes', 'status', 'ai_score', 'ai_label', 'is_duplicate', 'created_at', 'academic_year_id'].filter(k => lCols.has(k))
    const out = []; let old = 0, skipped = 0
    for await (const l of rows('admission_leads.csv')) {
      if (!inBranch(l.branch_id)) continue
      const yn = yearNameOf(l.created_date)
      if (!HISTORY && !yearIdByName.has(yn)) { old++; continue }              // that year does not exist on the website
      if (have.has(l.lead_id)) { skipped++; continue }
      const sc = Number(l.ai_score) || 0
      const rec = { school_id: schoolId, parent_name: l.prospect_name, phone: l.phone, child_grade: gradeName(l.grade_interested), area: branches[l.branch_id]?.city || null,
                    lead_source: l.source, notes: 'Imported ' + l.lead_id, status: leadStatus(l.status), ai_score: sc, ai_label: labelFor(sc), is_duplicate: 0,
                    created_at: l.created_date + ' 10:00:00', academic_year_id: await ensureYear(yn) }
      out.push(lKeys.map(k => rec[k]))
    }
    summary.leads = { new: out.length, older_years_skipped: old, skipped }
    log(`📣  Leads: ${out.length.toLocaleString()} to add${old ? `, ${old.toLocaleString()} from older years left out (add --history to include them)` : ''}${skipped ? `, ${skipped.toLocaleString()} already there` : ''}`)
    if (!lCols.has('academic_year_id')) log('⚠   leads has no academic_year_id column — run the leads-year migration, otherwise the Leads page may not show them.')
    if (!DRY && out.length) await insertBatches('leads', lKeys, out, 'leads')
  }

  log(`\n${DRY ? '👀  Dry run finished — nothing was written.' : '✅  Import finished.'}`)
  if (adminLogin) log(`\n🔑  Log in to the new school with:\n      Email:    ${adminLogin.email}\n      Password: ${adminLogin.pw}\n    (shown only once — save it)\n    To remove it all later:  node src/db/import_synthetic_school.js --undo --school-id ${schoolId} --yes`)
  else if (!DRY) log(`\n    This school was not created by the script, so --undo is switched off for it. If you want to be able to remove the test data in one command, rename the school so its name ends with "${SUFFIX.trim()}", then run:  node src/db/import_synthetic_school.js --undo --school-id ${schoolId} --yes`)
  log('\n    Not imported: monthly attendance, exam marks, staff, transport routes, message logs (they do not match the current tables).\n')
  return summary
}

run().then(() => pool.end()).catch(e => { console.error('\n❌  Failed:', e.message); pool.end().finally(() => process.exit(1)) })