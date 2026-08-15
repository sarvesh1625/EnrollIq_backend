require('dotenv').config()
const { pool } = require('../src/db/pool')
pool.query("SELECT name, highlights, achievements FROM schools WHERE name LIKE '%Vidya%' LIMIT 1")
  .then(([r]) => {
    console.log('NAME:', r[0] && r[0].name)
    console.log('HIGHLIGHTS:', r[0] && r[0].highlights)
    console.log('ACHIEVEMENTS:', r[0] && r[0].achievements)
    process.exit(0)
  })
