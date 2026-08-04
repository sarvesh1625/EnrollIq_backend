/**
 * EnrollIQ — School Kit migration (Node)
 * --------------------------------------
 * Save as:  src/db/migrate_school_kit.js
 * Run:      npm run db:migrate:kit   (or: node src/db/migrate_school_kit.js)
 *
 * Creates: kit_items, kit_template_items, student_kit_issues
 * Also seeds sensible demo items + a Grade 1 / Grade 4 / LKG template
 * (only if the items table is empty) so the module demos instantly.
 * Safe to re-run on any environment.
 */
require('dotenv').config()
const { pool } = require('./pool')

async function migrate() {
  console.log('\n🎒  School Kit migration\n')

  // 1) Kit items master
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kit_items (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(120) NOT NULL,
      category   VARCHAR(30)  NOT NULL DEFAULT 'Other',   -- Books/Uniform/Stationery/Footwear/Accessories/Other
      price      DECIMAL(8,2) NOT NULL DEFAULT 0,
      has_sizes  TINYINT(1)   NOT NULL DEFAULT 0,
      size_type  VARCHAR(15)  NULL,                        -- 'clothing' | 'shoes'
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('  ✅ kit_items table ready')

  // 2) Per-class kit templates (which items make up "Grade 4 Kit")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kit_template_items (
      id       INT AUTO_INCREMENT PRIMARY KEY,
      class    VARCHAR(20) NOT NULL,        -- e.g. 'Grade 4', 'LKG'
      item_id  INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      UNIQUE KEY uq_tpl (class, item_id),
      FOREIGN KEY (item_id) REFERENCES kit_items(id) ON DELETE CASCADE
    )
  `)
  console.log('  ✅ kit_template_items table ready')

  // 3) Per-student issuance tracking (the checklist)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_kit_issues (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      student_id     INT NOT NULL,
      item_id        INT NOT NULL,
      quantity       INT NOT NULL DEFAULT 1,
      status         VARCHAR(12) NOT NULL DEFAULT 'Pending',   -- Pending | Issued | Returned
      size           VARCHAR(10) NULL,
      payment_status VARCHAR(10) NOT NULL DEFAULT 'Unpaid',    -- Unpaid | Paid
      issued_by      INT NULL,
      issued_at      TIMESTAMP NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_issue (student_id, item_id),
      FOREIGN KEY (item_id)    REFERENCES kit_items(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id)  ON DELETE CASCADE
    )
  `)
  console.log('  ✅ student_kit_issues table ready')

  // 4) Seed demo items + templates (only if empty)
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM kit_items`)
  if (n === 0) {
    const items = [
      // name, category, price, has_sizes, size_type
      ['Textbook Set',            'Books',       1800, 0, null],
      ['Notebook Bundle (10)',    'Books',        450, 0, null],
      ['Summer Uniform Set',      'Uniform',      950, 1, 'clothing'],
      ['Winter Uniform Set',      'Uniform',     1250, 1, 'clothing'],
      ['Sports T-Shirt',          'Uniform',      380, 1, 'clothing'],
      ['School Shoes (Black)',    'Footwear',     780, 1, 'shoes'],
      ['Sports Shoes (White)',    'Footwear',     820, 1, 'shoes'],
      ['School Bag',              'Accessories',  650, 0, null],
      ['ID Card + Lanyard',       'Accessories',   80, 0, null],
      ['Stationery Kit',          'Stationery',   250, 0, null],
      ['Water Bottle',            'Accessories',  180, 0, null],
      ['School Diary',            'Books',        120, 0, null],
    ]
    for (const [name, category, price, has_sizes, size_type] of items) {
      await pool.execute(
        `INSERT INTO kit_items (name, category, price, has_sizes, size_type) VALUES (?,?,?,?,?)`,
        [name, category, price, has_sizes, size_type]
      )
    }
    console.log(`  ✅ seeded ${items.length} demo kit items`)

    // Default template: same full kit for a few classes (edit later in UI)
    const [rows] = await pool.query(`SELECT id FROM kit_items`)
    const allIds = rows.map(r => r.id)
    for (const cls of ['LKG', 'UKG', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']) {
      for (const itemId of allIds) {
        await pool.execute(
          `INSERT IGNORE INTO kit_template_items (class, item_id, quantity) VALUES (?,?,1)`,
          [cls, itemId]
        )
      }
    }
    console.log('  ✅ seeded default kit templates for LKG–Grade 5')
  } else {
    console.log(`  ⏭  kit_items already has ${n} item(s) — skipping seed`)
  }

  console.log('\n✅  School Kit migration complete!\n')
  await pool.end()
}

migrate().catch((err) => {
  console.error('\n❌  Migration failed:', err.message)
  process.exit(1)
})