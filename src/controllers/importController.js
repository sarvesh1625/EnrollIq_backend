const { pool }     = require('../db/pool')
const { bulkScore } = require('../controllers/aiController')

// POST /api/import/leads — bulk import leads from parsed CSV/Excel data
async function importLeads(req, res, next) {
  try {
    const { rows } = req.body
    // rows = [{ parent_name, phone, email, child_grade, area, lead_source, keyword, notes }]
    const schoolId = req.user.school_id

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows array is required' })
    }

    // Log import attempt
    const [importLog] = await pool.execute(
      `INSERT INTO bulk_imports (school_id, import_type, total_rows, status, imported_by) VALUES (?,?,?,'Processing',?)`,
      [schoolId, 'leads', rows.length, req.user.id]
    )
    const importId = importLog.insertId

    // Score all leads with AI
    const scoredRows = await bulkScore(rows)

    let success = 0
    let failed  = 0
    const errors = []

    for (const row of scoredRows) {
      try {
        if (!row.parent_name || !row.phone) {
          failed++
          errors.push(`Row missing parent_name or phone: ${JSON.stringify(row)}`)
          continue
        }

        // Duplicate check
        const [dup] = await pool.execute(
          `SELECT id FROM leads WHERE school_id=? AND phone=? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
          [schoolId, row.phone]
        )

        await pool.execute(`
          INSERT INTO leads
            (school_id, parent_name, phone, email, child_grade, area, lead_source, keyword, notes, ai_score, ai_label, is_duplicate)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
          schoolId, row.parent_name, row.phone.toString().trim(),
          row.email || null, row.child_grade || null,
          row.area || null, row.lead_source || 'Form',
          row.keyword || null, row.notes || null,
          row.ai_score, row.ai_label, dup.length > 0 ? 1 : 0
        ])
        success++
      } catch (e) {
        failed++
        errors.push(e.message)
      }
    }

    // Update import log
    await pool.execute(
      `UPDATE bulk_imports SET success_rows=?, failed_rows=?, status='Completed', errors=? WHERE id=?`,
      [success, failed, errors.slice(0,10).join('\n') || null, importId]
    )

    res.status(201).json({
      message:  `Import complete: ${success} leads added, ${failed} failed`,
      success, failed,
      import_id: importId,
    })
  } catch (err) { next(err) }
}

// POST /api/import/students — bulk import students
async function importStudents(req, res, next) {
  try {
    const { rows } = req.body
    const schoolId = req.user.school_id

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows array is required' })
    }

    const [importLog] = await pool.execute(
      `INSERT INTO bulk_imports (school_id, import_type, total_rows, status, imported_by) VALUES (?,?,?,'Processing',?)`,
      [schoolId, 'students', rows.length, req.user.id]
    )

    let success = 0, failed = 0
    const errors = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        if (!row.name) { failed++; errors.push(`Row ${i+1}: name is required`); continue }

        const rollNumber = row.roll_number || `S-${String(i + 1).padStart(3, '0')}`

        await pool.execute(`
          INSERT INTO students (school_id, name, roll_number, class, section, dob, parent_name, parent_phone, parent_email, area)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE class=VALUES(class), parent_name=VALUES(parent_name), parent_phone=VALUES(parent_phone)
        `, [
          schoolId, row.name, rollNumber,
          row.class || row.grade || null,
          row.section || null,
          row.dob || null,
          row.parent_name || null,
          row.phone || row.parent_phone || null,
          row.email || row.parent_email || null,
          row.area || null
        ])
        success++
      } catch (e) {
        failed++
        errors.push(`Row ${i+1}: ${e.message}`)
      }
    }

    await pool.execute(
      `UPDATE bulk_imports SET success_rows=?, failed_rows=?, status='Completed', errors=? WHERE id=?`,
      [success, failed, errors.slice(0,10).join('\n') || null, importLog.insertId]
    )

    res.status(201).json({ message: `Import complete: ${success} students added, ${failed} failed`, success, failed })
  } catch (err) { next(err) }
}

// GET /api/import/history
async function getImportHistory(req, res, next) {
  try {
    const [imports] = await pool.execute(`
      SELECT bi.*, u.name AS imported_by_name
      FROM   bulk_imports bi
      LEFT JOIN users u ON u.id = bi.imported_by
      WHERE  bi.school_id=?
      ORDER  BY bi.created_at DESC LIMIT 20
    `, [req.user.school_id])
    res.json(imports)
  } catch (err) { next(err) }
}

module.exports = { importLeads, importStudents, getImportHistory }