import { createClient } from '@libsql/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Local dev: plain file DB. Production (Vercel): Turso (set via env vars).
const db = process.env.TURSO_DATABASE_URL
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    })
  : createClient({
      url: `file:${path.join(__dirname, 'tokyo.db')}`
    })

// Initialize database schema
export async function initializeDatabase() {
  // Products table with inventory
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      soldOut INTEGER DEFAULT 0,
      placeholderColor TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Orders table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      customer_zipcode TEXT,
      customer_memo TEXT,
      items_json TEXT NOT NULL,
      total_price INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'pending',
      shipping_method TEXT DEFAULT 'standard',
      tracking_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Order status history table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  // Shipping methods table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shipping_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      estimated_days INTEGER NOT NULL
    )
  `)

  // Migrations: add columns to products if they don't exist yet
  const columns = await db.execute('PRAGMA table_info(products)')
  const columnNames = columns.rows.map(col => col.name)
  const migrations = {
    external_url: 'ALTER TABLE products ADD COLUMN external_url TEXT', // link to the seller's listing on an external marketplace, e.g. 후르츠
    image_url: 'ALTER TABLE products ADD COLUMN image_url TEXT',
    description: 'ALTER TABLE products ADD COLUMN description TEXT',
    size: 'ALTER TABLE products ADD COLUMN size TEXT'
  }
  for (const [column, sql] of Object.entries(migrations)) {
    if (!columnNames.includes(column)) {
      await db.execute(sql)
    }
  }

  // One listing = one product row. Guards against overlapping sync runs (e.g. a
  // manual workflow_dispatch landing on top of the next scheduled tick)
  // double-inserting the same listing. NULLs don't collide, so manually created
  // products without an external_url are unaffected.
  // Tolerate failure: if a pre-existing DB already holds duplicate
  // external_urls the index can't be built, and that must not take down every
  // other route that boots through this module.
  try {
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_external_url ON products(external_url) WHERE external_url IS NOT NULL'
    )
  } catch (err) {
    console.error('⚠️ external_url 유니크 인덱스를 만들지 못했습니다 (중복 데이터 확인 필요):', err.message)
  }

  // Check if shipping methods exist
  const shippingCount = await db.execute('SELECT COUNT(*) as count FROM shipping_methods')

  if (shippingCount.rows[0].count === 0) {
    const shippingMethods = [
      ['Standard', 0, 5],
      ['Express', 5000, 2],
      ['Overnight', 10000, 1]
    ]

    for (const [name, price, days] of shippingMethods) {
      await db.execute({
        sql: `INSERT INTO shipping_methods (name, price, estimated_days) VALUES (?, ?, ?)`,
        args: [name, price, days]
      })
    }
  }

  console.log('✅ Database initialized successfully')
}

export default db
