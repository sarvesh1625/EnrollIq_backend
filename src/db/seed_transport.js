require('dotenv').config()
const { pool } = require('./pool')

async function seed() {
  const [schools] = await pool.execute('SELECT id FROM schools LIMIT 1')
  const schoolId  = schools[0].id

  await pool.execute(`
    INSERT INTO buses (school_id, bus_number, plate_number, capacity)
    VALUES (?, 'BUS-01', 'TS09AB1234', 40),
           (?, 'BUS-02', 'TS09CD5678', 35),
           (?, 'BUS-03', 'TS09EF9012', 40),
           (?, 'BUS-04', 'TS09GH3456', 30)
    ON DUPLICATE KEY UPDATE plate_number = plate_number
  `, [schoolId, schoolId, schoolId, schoolId])

  console.log('✅ Buses seeded')
  await pool.end()
}

seed().catch(console.error)