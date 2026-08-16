require('dotenv').config()
const mysql = require('mysql2/promise')
;(async () => {
  const db = await mysql.createConnection({
    host: 'altaria.proxy.rlwy.net', port: 16503, user: 'root',
    password: 'NlVNKkujwcmWcIoYmXQbflrfjsbTAufD', database: 'railway'
  })
  // fix corrupted question_breakdown (the [object Object] rows)
  const [r1] = await db.query("UPDATE answer_sheets SET question_breakdown='[]' WHERE question_breakdown LIKE '%[object Object]%'")
  console.log('Fixed answer_sheets.question_breakdown rows:', r1.affectedRows)
  // also check other JSON-ish columns for the same corruption
  for (const [tbl, col] of [['exam_questions','options'],['class_posts','attachments'],['report_card_insights','weak_subjects'],['report_card_insights','strong_subjects']]) {
    try {
      const [r] = await db.query(`UPDATE \`${tbl}\` SET \`${col}\`=NULL WHERE \`${col}\` LIKE '%[object Object]%'`)
      if (r.affectedRows) console.log(`Fixed ${tbl}.${col}:`, r.affectedRows)
    } catch {}
  }
  console.log('Done.')
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(0) })
