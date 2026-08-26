const mysql = require('mysql2/promise')
require('dotenv').config()
console.log('DEBUG ENV CHECK:', process.env.DB_NAME, process.env.DB_HOST, process.env.DB_PASSWORD ? 'password-set' : 'password-missing')

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME     || 'cmr_of_school',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+05:30',
})

/*
 * ── MySQL 9 compatibility shim ─────────────────────────────────────────────
 * Railway runs MySQL 9.x. With mysql2, pool.execute() uses the binary
 * prepared-statement protocol, and MySQL 9 is strict: LIMIT/OFFSET and some
 * integer parameters sent as bound "?" values throw
 *   "Incorrect arguments to mysqld_stmt_execute".
 * Local MySQL (older) was lenient, so it only breaks in production.
 *
 * Fix: transparently route .execute() through .query() (the text protocol),
 * which still escapes params safely but doesn't use prepared statements, so
 * LIMIT ? / OFFSET ? work fine. Every controller keeps calling pool.execute()
 * unchanged — no other file needs editing.
 */
const _origExecute = pool.execute.bind(pool)
pool.execute = function (sql, params) {
  return pool.query(sql, params)
}

// query() helper (unchanged API)
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return [rows]
}

pool.getConnection()
  .then(conn => {
    console.log('✅  MySQL connected — database:', process.env.DB_NAME || 'cmr_of_school')
    conn.release()
  })
  .catch(err => {
    console.error('❌  MySQL connection failed:', err.message)
  })

module.exports = { pool, query }
