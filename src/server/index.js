import express from 'express'
import cors from 'cors'
import { randomBytes } from 'crypto'
import db, { initializeDatabase } from './db.js'

try {
  process.loadEnvFile()
} catch {
  // no .env file present; rely on real environment variables instead
}

const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

// Small helpers around the libsql client so route handlers read like sync SQL.
async function get(sql, args = []) {
  const result = await db.execute({ sql, args })
  return result.rows[0]
}
async function all(sql, args = []) {
  const result = await db.execute({ sql, args })
  return result.rows
}
async function run(sql, args = []) {
  return db.execute({ sql, args })
}

await initializeDatabase()

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.')
  process.exit(1)
}

// Issued admin tokens live only in memory - they reset when the server restarts
// (and on Vercel, per cold-started instance).
const validAdminTokens = new Set()

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token || !validAdminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  next()
}

// ==================== AUTH ====================

// Admin login
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: '비번을 입력하세요' })
    }

    if (password === ADMIN_PASSWORD) {
      const token = 'admin_' + randomBytes(32).toString('hex')
      validAdminTokens.add(token)
      res.json({
        token,
        message: '로그인 성공'
      })
    } else {
      res.status(401).json({ error: '비번이 틀렸습니다' })
    }
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ==================== PRODUCTS ====================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await all('SELECT * FROM products')
    const formattedProducts = products.map(p => ({
      ...p,
      soldOut: p.stock <= 0 || p.soldOut === 1
    }))
    res.json(formattedProducts)
  } catch (err) {
    console.error('Error fetching products:', err)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await get('SELECT * FROM products WHERE id = ?', [req.params.id])
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    product.soldOut = product.stock <= 0 || product.soldOut === 1
    res.json(product)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// Create product (admin)
app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const { name, price, category, stock, placeholderColor, external_url, image_url, description } = req.body

    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: 'name, price, category는 필수입니다' })
    }
    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ error: 'price가 올바르지 않습니다' })
    }

    const result = await run(
      `INSERT INTO products (name, price, category, stock, placeholderColor, external_url, image_url, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        Number(price),
        category,
        Number(stock) || 0,
        placeholderColor || '#1a1a1a',
        external_url || null,
        image_url || null,
        description || null
      ]
    )

    const product = await get('SELECT * FROM products WHERE id = ?', [Number(result.lastInsertRowid)])
    res.status(201).json(product)
  } catch (err) {
    console.error('Product creation error:', err)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// Update product (admin)
app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await get('SELECT * FROM products WHERE id = ?', [req.params.id])
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' })
    }

    const {
      name = existing.name,
      price = existing.price,
      category = existing.category,
      stock = existing.stock,
      placeholderColor = existing.placeholderColor,
      external_url = existing.external_url,
      image_url = existing.image_url,
      description = existing.description
    } = req.body

    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ error: 'price가 올바르지 않습니다' })
    }

    await run(
      `UPDATE products SET name = ?, price = ?, category = ?, stock = ?, placeholderColor = ?, external_url = ?, image_url = ?, description = ? WHERE id = ?`,
      [name, Number(price), category, Number(stock), placeholderColor, external_url, image_url, description, req.params.id]
    )

    const updated = await get('SELECT * FROM products WHERE id = ?', [req.params.id])
    res.json(updated)
  } catch (err) {
    console.error('Product update error:', err)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// Import product info from an external listing URL (admin) - currently
// supports fruitsfamily.com product pages via their JSON-LD Product block.
const IMPORT_ALLOWED_HOSTS = ['fruitsfamily.com', 'www.fruitsfamily.com']
const CATEGORY_MAP = {
  '아우터': 'Outer',
  '상의': 'Top',
  '하의': 'Bottom',
  '팬츠': 'Bottom',
  '신발': 'Acc',
  '잡화': 'Acc',
  '가방': 'Acc',
  '액세서리': 'Acc'
}

app.post('/api/admin/import-product', requireAdmin, async (req, res) => {
  try {
    const { url } = req.body
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch {
      return res.status(400).json({ error: '올바른 URL이 아닙니다' })
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: '올바른 URL이 아닙니다' })
    }
    if (!IMPORT_ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
      return res.status(400).json({ error: '지원하지 않는 사이트입니다 (fruitsfamily.com만 지원)' })
    }

    // redirect: 'manual' so a redirect off fruitsfamily.com (e.g. to an
    // internal address) can't silently bypass the host allowlist above.
    const pageResponse = await fetch(parsedUrl.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TokyoCollectiveBot/1.0)' }
    })
    if (pageResponse.type === 'opaqueredirect' || (pageResponse.status >= 300 && pageResponse.status < 400)) {
      return res.status(502).json({ error: '이 링크는 다른 주소로 리다이렉트되어 처리할 수 없습니다' })
    }
    if (!pageResponse.ok) {
      return res.status(502).json({ error: '상품 페이지를 불러오지 못했습니다' })
    }
    const html = await pageResponse.text()

    const ldJsonBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    let productData = null
    for (const block of ldJsonBlocks) {
      try {
        const parsed = JSON.parse(block[1])
        if (parsed['@type'] === 'Product') {
          productData = parsed
          break
        }
      } catch {
        // skip malformed block
      }
    }

    if (!productData) {
      return res.status(422).json({ error: '상품 정보를 찾지 못했습니다' })
    }

    res.json({
      name: productData.name || '',
      price: productData.offers?.price ?? '',
      description: productData.description || '',
      image_url: Array.isArray(productData.image) ? productData.image[0] : productData.image || '',
      category: CATEGORY_MAP[productData.category] || 'Top',
      external_url: parsedUrl.toString()
    })
  } catch (err) {
    console.error('Product import error:', err)
    res.status(500).json({ error: '상품 정보를 가져오지 못했습니다' })
  }
})

// Delete product (admin)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await get('SELECT * FROM products WHERE id = ?', [req.params.id])
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' })
    }
    await run('DELETE FROM products WHERE id = ?', [req.params.id])
    res.status(204).end()
  } catch (err) {
    console.error('Product delete error:', err)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

// ==================== SHIPPING METHODS ====================

// Get all shipping methods
app.get('/api/shipping-methods', async (req, res) => {
  try {
    const methods = await all('SELECT * FROM shipping_methods')
    res.json(methods)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipping methods' })
  }
})

// ==================== ORDERS ====================

// Create new order
app.post('/api/orders', async (req, res) => {
  try {
    const { customer, items, status } = req.body

    // Validation
    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Validate and calculate actual price
    const resolvedItems = []
    let calculatedPrice = 0

    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = ?', [item.id])
      if (!product) {
        return res.status(400).json({ error: `Product ${item.id} not found` })
      }

      // Check stock
      if (product.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
        })
      }

      resolvedItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity
      })

      calculatedPrice += product.price * item.quantity
    }

    const orderId = `ORD-${Date.now()}`

    // Insert order
    await run(
      `INSERT INTO orders (
        id, customer_name, customer_phone, customer_email,
        customer_address, customer_zipcode, customer_memo,
        items_json, total_price, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.zipCode || '',
        customer.memo || '',
        JSON.stringify(resolvedItems),
        calculatedPrice,
        status || 'pending',
        'pending'
      ]
    )

    // Deduct stock for each item
    for (const item of resolvedItems) {
      await run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id])
    }

    // Add status history
    await run(
      `INSERT INTO order_status_history (order_id, status, notes) VALUES (?, ?, ?)`,
      [orderId, 'pending', '주문 생성됨']
    )

    // Fetch and return the created order
    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId])
    order.items = JSON.parse(order.items_json)
    delete order.items_json

    res.status(201).json(order)
  } catch (err) {
    console.error('Order creation error:', err)
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// Get all orders
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await all('SELECT * FROM orders ORDER BY created_at DESC')
    const formatted = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items_json)
    }))
    res.json(formatted)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

// Get order by ID
app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id])
    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    order.items = JSON.parse(order.items_json)
    delete order.items_json

    // Get status history
    const statusHistory = await all(
      `SELECT status, timestamp, notes FROM order_status_history
       WHERE order_id = ?
       ORDER BY timestamp ASC`,
      [req.params.id]
    )

    res.json({ ...order, statusHistory })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' })
  }
})

// Update order status
app.patch('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notes, trackingNumber } = req.body
    const orderId = req.params.id

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId])
    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    // Valid status transitions
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`
      })
    }

    // Update order
    await run(
      `UPDATE orders SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status || order.status, trackingNumber || order.tracking_number, orderId]
    )

    // Add to status history
    await run(
      `INSERT INTO order_status_history (order_id, status, notes) VALUES (?, ?, ?)`,
      [orderId, status || order.status, notes || '']
    )

    // Return updated order
    const updatedOrder = await get('SELECT * FROM orders WHERE id = ?', [orderId])
    updatedOrder.items = JSON.parse(updatedOrder.items_json)
    delete updatedOrder.items_json

    res.json(updatedOrder)
  } catch (err) {
    console.error('Order update error:', err)
    res.status(500).json({ error: 'Failed to update order' })
  }
})

// ==================== INVENTORY ====================

// Get stock for a product
app.get('/api/inventory/:productId', async (req, res) => {
  try {
    const product = await get('SELECT id, name, stock FROM products WHERE id = ?', [req.params.productId])
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.json(product)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' })
  }
})

// Get inventory summary (low stock alerts)
app.get('/api/inventory/summary/alerts', async (req, res) => {
  try {
    const lowStockProducts = await all(
      'SELECT id, name, stock FROM products WHERE stock < 3 ORDER BY stock ASC'
    )
    res.json(lowStockProducts)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory summary' })
  }
})

// Vercel imports this module and calls the exported app directly as a
// serverless function - only bind to a port when run as a local process.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`✅ 빈티지 샵 API 서버 실행 중 → http://localhost:${port}`)
    console.log(`📦 데이터베이스: ${process.env.TURSO_DATABASE_URL ? 'Turso' : 'tokyo.db (local)'}`)
    console.log(`🔗 주요 엔드포인트:`)
    console.log(`   - GET  /api/products`)
    console.log(`   - POST /api/orders`)
    console.log(`   - GET  /api/orders/:id`)
    console.log(`   - PATCH /api/orders/:id (주문 상태 업데이트)`)
    console.log(`   - GET  /api/shipping-methods`)
  })
}

export default app
