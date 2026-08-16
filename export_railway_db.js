/**
 * EnrollIQ — Export the Railway database to a .sql file
 * Save as:  export_railway_db.js  (in your backend folder)
 * Run:      node export_railway_db.js
 *
 * Produces enrolliq_backup.sql — import it into Hostinger via phpMyAdmin.
 * Uses your existing mysql2 package. No mysqldump needed.
 */
const mysql = require('mysql2/promise')
const fs = require('fs')

// Railway connection (from your .env)
const CONFIG = {
  host: 'altaria.proxy.rlwy.net',
  port: 16503,
  user: 'root',
  password: 'NlVNKkujwcmWcIoYmXQbflrfjsbTAufD',
  database: 'railway',
  multipleStatements: true,
}

// columns that must contain valid JSON in the new DB (had a CHECK constraint)
const JSON_COLS = new Set(['question_breakdown','options','attachments','weak_subjects','strong_subjects','tags','extracted_answer'])

function looksBad(s) {
  return typeof s === 'string' && s.includes('[object Object]')
}

function sanitizeForCol(colName, v) {
  // if a JSON column holds corrupted "[object Object]" text, replace with valid empty JSON
  if (JSON_COLS.has(colName) && looksBad(v)) return '[]'
  // if a JSON column holds something that isn't valid JSON, null it out
  if (JSON_COLS.has(colName) && typeof v === 'string' && v.trim() !== '') {
    try { JSON.parse(v) } catch { 
      // try double-parse (double-encoded), else null
      try { JSON.parse(JSON.parse(v)) } catch { return null }
    }
  }
  return v
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return v
  if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`
  return `'${String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'\\r')}'`
}

async function main() {
  const db = await mysql.createConnection(CONFIG)
  console.log('Connected to Railway. Exporting...\n')

  let out = `-- EnrollIQ Railway export\n-- Generated ${new Date().toISOString()}\n\n`
  out += `SET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n`

  const [tables] = await db.query('SHOW TABLES')
  const key = Object.keys(tables[0])[0]
  const tableNames = tables.map(t => t[key])

  for (const table of tableNames) {
    process.stdout.write(`  ${table} ... `)
    // CREATE TABLE
    const [[createRow]] = await db.query(`SHOW CREATE TABLE \`${table}\``)
    let createSql = createRow['Create Table']
    // Remove JSON validity CHECK constraints (Railway lacked them; Hostinger enforces them
    // and rejects legacy rows). Data still imports; app already parses defensively.
    createSql = createSql
      .replace(/,\s*CONSTRAINT `[^`]+` CHECK \(json_valid\(`[^`]+`\)\)/gi, '')
      .replace(/,\s*CHECK \(json_valid\(`[^`]+`\)\)/gi, '')
      // convert JSON column TYPE to LONGTEXT (MySQL auto-validates JSON columns;
      // legacy rows contain non-JSON text like [object Object]).
      // Matches: `colname` json[,\n]  →  `colname` LONGTEXT
      .replace(/(`[^`]+`\s+)json(\b)/gi, '$1LONGTEXT$2')
    out += `\n-- ----------------------------\n-- Table: ${table}\n-- ----------------------------\n`
    out += `DROP TABLE IF EXISTS \`${table}\`;\n${createSql};\n\n`

    // DATA
    const [rows] = await db.query(`SELECT * FROM \`${table}\``)
    if (rows.length) {
      const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ')
      out += `INSERT INTO \`${table}\` (${cols}) VALUES\n`
      const colNames = Object.keys(rows[0])
      const values = rows.map(r => '(' + colNames.map(cn => esc(sanitizeForCol(cn, r[cn]))).join(', ') + ')')
      out += values.join(',\n') + ';\n\n'
    }
    console.log(`${rows.length} rows`)
  }

  out += `\nSET FOREIGN_KEY_CHECKS=1;\n`
  fs.writeFileSync('enrolliq_backup.sql', out, 'utf8')
  console.log(`\n✅ Done → enrolliq_backup.sql (${(out.length/1024).toFixed(0)} KB)`)
  console.log('Import this file into Hostinger via phpMyAdmin → Import.\n')
  await db.end()
  process.exit(0)
}
main().catch(e => { console.error('\n❌ Export failed:', e.message); process.exit(1) })