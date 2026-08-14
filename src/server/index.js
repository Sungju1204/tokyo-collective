import express from 'express'
import cors from 'cors'
import db, { initializeDatabase } from './db.js'

const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

// Initialize database
initializeDatabase()

const ADMIN_PASSWORD = 'admin123'

// ==================== AUTH ====================

// Admin login
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: '비번을 입력하세요' })
    }

    if (password === ADMIN_PASSWORD) {
      // 간단한 토큰 생성 (프로덕션에서는 JWT 사용)
      const token = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
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
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products').all()
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
app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    product.soldOut = product.stock <= 0 || product.soldOut === 1
    res.json(product)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// ==================== SHIPPING METHODS ====================

// Get all shipping methods
app.get('/api/shipping-methods', (req, res) => {
  try {
    const methods = db.prepare('SELECT * FROM shipping_methods').all()
    res.json(methods)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipping methods' })
  }
})

// ==================== ORDERS ====================

// Create new order
app.post('/api/orders', (req, res) => {
  try {
    const { customer, items, totalPrice, status } = req.body

    // Validation
    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Validate and calculate actual price
    const insertStmt = db.prepare('SELECT * FROM products WHERE id = ?')
    const resolvedItems = []
    let calculatedPrice = 0

    for (const item of items) {
      const product = insertStmt.get(item.id)
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

    // Begin transaction
    const orderId = `ORD-${Date.now()}`

    // Insert order
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, customer_name, customer_phone, customer_email,
        customer_address, customer_zipcode, customer_memo,
        items_json, total_price, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insertOrder.run(
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
    )

    // Deduct stock for each item
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
    for (const item of resolvedItems) {
      updateStock.run(item.quantity, item.id)
    }

    // Add status history
    const insertHistory = db.prepare(`
      INSERT INTO order_status_history (order_id, status, notes)
      VALUES (?, ?, ?)
    `)
    insertHistory.run(orderId, 'pending', '주문 생성됨')

    // Fetch and return the created order
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    order.items = JSON.parse(order.items_json)
    delete order.items_json

    res.status(201).json(order)
  } catch (err) {
    console.error('Order creation error:', err)
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// Get all orders
app.get('/api/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all()
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
app.get('/api/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    order.items = JSON.parse(order.items_json)
    delete order.items_json

    // Get status history
    const statusHistory = db.prepare(`
      SELECT status, timestamp, notes FROM order_status_history
      WHERE order_id = ?
      ORDER BY timestamp ASC
    `).all(req.params.id)

    res.json({ ...order, statusHistory })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' })
  }
})

// Update order status
app.patch('/api/orders/:id', (req, res) => {
  try {
    const { status, notes, trackingNumber } = req.body
    const orderId = req.params.id

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
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
    const updateOrder = db.prepare(`
      UPDATE orders
      SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    updateOrder.run(status || order.status, trackingNumber || order.tracking_number, orderId)

    // Add to status history
    const insertHistory = db.prepare(`
      INSERT INTO order_status_history (order_id, status, notes)
      VALUES (?, ?, ?)
    `)
    insertHistory.run(orderId, status || order.status, notes || '')

    // Return updated order
    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
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
app.get('/api/inventory/:productId', (req, res) => {
  try {
    const product = db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(req.params.productId)
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.json(product)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' })
  }
})

// Get inventory summary (low stock alerts)
app.get('/api/inventory/summary/alerts', (req, res) => {
  try {
    const lowStockProducts = db.prepare(`
      SELECT id, name, stock FROM products WHERE stock < 3 ORDER BY stock ASC
    `).all()
    res.json(lowStockProducts)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory summary' })
  }
})

app.listen(port, () => {
  console.log(`✅ 빈티지 샵 API 서버 실행 중 → http://localhost:${port}`)
  console.log(`📦 데이터베이스: tokyo.db`)
  console.log(`🔗 주요 엔드포인트:`)
  console.log(`   - GET  /api/products`)
  console.log(`   - POST /api/orders`)
  console.log(`   - GET  /api/orders/:id`)
  console.log(`   - PATCH /api/orders/:id (주문 상태 업데이트)`)
  console.log(`   - GET  /api/shipping-methods`)
})
