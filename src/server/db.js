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

  // Migration: add external_url to products if it doesn't exist yet
  // (link to the seller's listing on an external marketplace, e.g. 후르츠)
  const columns = await db.execute('PRAGMA table_info(products)')
  const hasExternalUrl = columns.rows.some(col => col.name === 'external_url')
  if (!hasExternalUrl) {
    await db.execute('ALTER TABLE products ADD COLUMN external_url TEXT')
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
