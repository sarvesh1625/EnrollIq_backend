const mysql = require('mysql2/promise')
require('dotenv').config()

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

// Helper — const [rows] = await query('SELECT ...', [params])
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params)
  return [rows]
}

pool.getConnection()
  .then(conn => {
    console.log('✅  MySQL connected — database: cmr of school')
    conn.release()
  })
  .catch(err => {
    console.error('❌  MySQL connection failed:', err.message)
  })

module.exports = { pool, query }