import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'tokyo.db')

const db = new Database(dbPath)

// Enable foreign keys
db.pragma('foreign_keys = ON')

// Initialize database schema
export function initializeDatabase() {
  // Products table with inventory
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipping_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      estimated_days INTEGER NOT NULL
    )
  `)

  // Check if products already exist
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get()

  if (productCount.count === 0) {
    // Insert initial products with stock
    const products = [
      { name: 'VINTAGE CARGO PANTS', price: 89000, category: 'Bottom', stock: 5, placeholderColor: '#1a1a1a' },
      { name: 'SUPREME LOGO TEE', price: 125000, category: 'Top', stock: 3, placeholderColor: '#222' },
      { name: 'OVERSIZED KNIT SWEATER', price: 158000, category: 'Top', stock: 4, placeholderColor: '#151515' },
      { name: '90s DENIM JACKET', price: 210000, category: 'Outer', stock: 2, placeholderColor: '#1d1d1d' },
      { name: 'LEATHER MESSENGER BAG', price: 175000, category: 'Acc', stock: 3, placeholderColor: '#111' },
      { name: 'GRAFFITI PRINT HOODIE', price: 95000, category: 'Outer', stock: 6, placeholderColor: '#1f1f1f' }
    ]

    const insertProduct = db.prepare(`
      INSERT INTO products (name, price, category, stock, placeholderColor)
      VALUES (?, ?, ?, ?, ?)
    `)

    products.forEach(product => {
      insertProduct.run(product.name, product.price, product.category, product.stock, product.placeholderColor)
    })
  }

  // Check if shipping methods exist
  const shippingCount = db.prepare('SELECT COUNT(*) as count FROM shipping_methods').get()

  if (shippingCount.count === 0) {
    const insertShipping = db.prepare(`
      INSERT INTO shipping_methods (name, price, estimated_days)
      VALUES (?, ?, ?)
    `)

    insertShipping.run('Standard', 0, 5)
    insertShipping.run('Express', 5000, 2)
    insertShipping.run('Overnight', 10000, 1)
  }

  console.log('✅ Database initialized successfully')
}

export default db
