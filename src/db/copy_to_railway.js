/**
 * EnrollIQ — Copy local database → Railway (no mysqldump needed)
 * -------------------------------------------------------------
 * Save as:  src/db/copy_to_railway.js  (in your backend)
 * Run:      node src/db/copy_to_railway.js
 *
 * Reads your LOCAL cmr_of_school and recreates every table (structure +
 * data) on RAILWAY. This brings across all the columns your local DB has
 * that the migrations missed (student_id, phone, etc.), fixing the
 * "Unknown column" errors in production.
 *
 * Safe: it DROPs and recreates each table on Railway only, never touches
 * your local database (local is read-only here).
 */
const mysql = require('mysql2/promise')

// ── LOCAL (source) — edit if your local creds differ ──
const LOCAL = {
  host: 'localhost', port: 3306,
  user: 'root', password: process.env.LOCAL_DB_PASSWORD || '',
  database: 'cmr_of_school', multipleStatements: true,
}

// ── RAILWAY (destination) ──
const RAILWAY = {
  host: 'altaria.proxy.rlwy.net', port: 16503,
  user: 'root', password: 'NlVNKkujwcmWcIoYmXQbflrfjsbTAufD',
  database: 'railway', multipleStatements: true,
}

async function main() {
  console.log('\n📦  Copying local database → Railway\n')
  const src = await mysql.createConnection(LOCAL)
  console.log('  ✅ connected to LOCAL cmr_of_school')
  const dst = await mysql.createConnection(RAILWAY)
  console.log('  ✅ connected to RAILWAY railway\n')

  // list local tables
  const [tables] = await src.query(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema = 'cmr_of_school' AND table_type = 'BASE TABLE'`)
  const names = tables.map(r => r.t || r.T)
  console.log(`  Found ${names.length} tables to copy\n`)

  await dst.query('SET FOREIGN_KEY_CHECKS = 0')

  for (const name of names) {
    process.stdout.write(`  • ${name} … `)
    // structure
    const [[{ 'Create Table': createSql }]] = await src.query(`SHOW CREATE TABLE \`${name}\``)
    await dst.query(`DROP TABLE IF EXISTS \`${name}\``)
    await dst.query(createSql)

    // data
    const [rows] = await src.query(`SELECT * FROM \`${name}\``)
    if (rows.length) {
      const cols = Object.keys(rows[0])
      const colList = cols.map(c => `\`${c}\``).join(',')
      // insert in batches of 200
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200)
        const placeholders = batch.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
        const values = batch.flatMap(r => cols.map(c => r[c]))
        await dst.query(`INSERT INTO \`${name}\` (${colList}) VALUES ${placeholders}`, values)
      }
    }
    console.log(`${rows.length} rows`)
  }

  await dst.query('SET FOREIGN_KEY_CHECKS = 1')
  console.log('\n✅  Done! Railway now matches your local database.\n')
  await src.end(); await dst.end()
}

main().catch(e => { console.error('\n❌  Failed:', e.message); process.exit(1) })