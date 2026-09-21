import express from 'express'
import cors from 'cors'
import { createHmac, timingSafeEqual } from 'crypto'
import db, { initializeDatabase } from './db.js'
import { fetchProductFromFruits, listNewFruitsListings, extractProductId, FruitsImportError } from './fruitsImport.js'
import { syncAvailability } from './syncAvailability.js'

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

// Optional: only the FruitsFamily sync endpoint needs this. Every API route
// boots from this module, so a missing SYNC_SECRET must not take the whole app
// down - the sync route returns 503 instead (see requireSyncSecret).
const SYNC_SECRET = process.env.SYNC_SECRET

// Self-verifying tokens (HMAC-signed, expiry embedded) rather than a server-side
// session store, since Vercel routes requests across multiple stateless instances
// that don't share in-memory state.
const ADMIN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function signAdminToken(expiresAt) {
  const payload = `admin.${expiresAt}`
  const signature = createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex')
  return `${payload}.${signature}`
}

function verifyAdminToken(token) {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'admin') return false
  const [prefix, expiresAtStr, signature] = parts
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false

  const expected = createHmac('sha256', ADMIN_PASSWORD).update(`${prefix}.${expiresAtStr}`).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  next()
}

function requireSyncSecret(req, res, next) {
  if (!SYNC_SECRET) {
    return res.status(503).json({ error: '동기화 기능이 설정되지 않았습니다' })
  }
  const provided = req.headers['x-sync-secret'] || ''
  const expectedBuf = Buffer.from(SYNC_SECRET)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
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
      const token = signAdminToken(Date.now() + ADMIN_TOKEN_TTL_MS)
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
    const { name, price, category, stock, placeholderColor, external_url, image_url, description, size } = req.body

    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: 'name, price, category는 필수입니다' })
    }
    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ error: 'price가 올바르지 않습니다' })
    }

    const result = await run(
      `INSERT INTO products (name, price, category, stock, placeholderColor, external_url, image_url, description, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        Number(price),
        category,
        Number(stock) || 0,
        placeholderColor || '#1a1a1a',
        external_url || null,
        image_url || null,
        description || null,
        size || null
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
      description = existing.description,
      size = existing.size
    } = req.body

    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ error: 'price가 올바르지 않습니다' })
    }

    await run(
      `UPDATE products SET name = ?, price = ?, category = ?, stock = ?, placeholderColor = ?, external_url = ?, image_url = ?, description = ?, size = ? WHERE id = ?`,
      [name, Number(price), category, Number(stock), placeholderColor, external_url, image_url, description, size, req.params.id]
    )

    const updated = await get('SELECT * FROM products WHERE id = ?', [req.params.id])
    res.json(updated)
  } catch (err) {
    console.error('Product update error:', err)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

app.post('/api/admin/import-product', requireAdmin, async (req, res) => {
  try {
    const { url } = req.body
    const product = await fetchProductFromFruits(url)
    res.json(product)
  } catch (err) {
    if (err instanceof FruitsImportError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error('Product import error:', err)
    res.status(500).json({ error: '상품 정보를 가져오지 못했습니다' })
  }
})

const SELLER_URL = 'https://fruitsfamily.com/seller/i9za/joongojoah'

// Since new listings are auto-published with no review queue, bound how many a
// single run can publish. A markup change that starts matching links outside
// the seller's own grid then shows up as a bounded, reported number rather than
// an unlimited silent blow-out.
const MAX_IMPORTS_PER_RUN = 20

app.post('/api/admin/sync-fruitsfamily', requireSyncSecret, async (req, res) => {
  // Read the seller page once up front: it drives both the delete check (a
  // product missing from it has been removed) and the new-listing import below.
  // A failure is held and rethrown later so the availability sync still runs.
  let listings = null
  let listingsError = null
  try {
    listings = await listNewFruitsListings(SELLER_URL)
  } catch (err) {
    listingsError = err
  }

  // Mirror FruitsFamily's sold-out / back-in-stock / removed state onto products
  // we already have. Independent of the import step, so a seller-page parse
  // failure can't block it (it just skips deletions, which need that page).
  let availability = { soldOut: [], restocked: [], deleted: [], deleteSuppressed: [], updated: [], skipped: [], unchecked: 0 }
  try {
    availability = await syncAvailability({
      listedIds: listings ? new Set(listings.map(listing => listing.id)) : undefined,
      listLinked: async () => {
        const rows = await all(
          `SELECT id, name, price, external_url,
                  (stock > 0 AND COALESCE(soldOut, 0) != 1) AS inStock
           FROM products WHERE external_url IS NOT NULL ORDER BY id`
        )
        return rows.map(row => ({ ...row, inStock: Number(row.inStock) === 1 }))
      },
      fetchProduct: fetchProductFromFruits,
      markSoldOut: id => run('UPDATE products SET stock = 0 WHERE id = ?', [id]),
      // Restocking also clears the legacy soldOut flag, which would otherwise
      // keep the product showing as sold out.
      markInStock: id => run('UPDATE products SET stock = 1, soldOut = 0 WHERE id = ?', [id]),
      deleteProduct: id => run('DELETE FROM products WHERE id = ?', [id]),
      // Columns come from this fixed list, never from the values, so the SQL text
      // cannot be influenced by anything read off FruitsFamily.
      updateDetails: (id, values) => {
        const columns = ['name', 'price'].filter(column => column in values)
        return run(
          `UPDATE products SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ?`,
          [...columns.map(column => values[column]), id]
        )
      }
    })
  } catch (err) {
    console.error('FruitsFamily availability sync failed:', err)
  }

  try {
    if (listingsError) throw listingsError

    const existingRows = await all('SELECT external_url FROM products WHERE external_url IS NOT NULL')
    const existingIds = new Set(
      existingRows.map(row => extractProductId(row.external_url)).filter(Boolean)
    )
    const candidates = listings.filter(listing => !existingIds.has(listing.id))
    const toImport = candidates.slice(0, MAX_IMPORTS_PER_RUN)
    const deferred = candidates.length - toImport.length

    const imported = []
    const skipped = []

    for (const candidate of toImport) {
      try {
        const product = await fetchProductFromFruits(candidate.url)
        if (!product.name || !Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
          skipped.push({ url: candidate.url, reason: '상품명 또는 가격 정보가 올바르지 않습니다' })
          continue
        }
        const result = await run(
          `INSERT INTO products (name, price, category, stock, placeholderColor, external_url, image_url, description, size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.name,
            Number(product.price) || 0,
            product.category,
            product.available ? 1 : 0,
            '#1a1a1a',
            product.external_url,
            product.image_url || null,
            product.description || null,
            product.size || null
          ]
        )
        imported.push({ id: Number(result.lastInsertRowid), name: product.name, external_url: product.external_url })
      } catch (err) {
        skipped.push({ url: candidate.url, reason: err.message })
      }
    }

    // Lands in Vercel's function logs so "0 imported, nothing new" can be told
    // apart from "0 imported, every insert failed".
    const summary = `FruitsFamily sync: ${imported.length} imported, ${skipped.length} skipped, ${deferred} deferred, ${availability.soldOut.length} sold out, ${availability.restocked.length} restocked, ${availability.deleted.length} deleted, ${availability.updated.length} updated`
    // Deleted products are logged by name: the row is gone, so this is the only
    // record of what was removed.
    if (availability.deleted.length > 0) {
      console.warn('FruitsFamily sync deleted products:', availability.deleted)
    }
    // Name/price overwrites replace what was stored, so log what they replaced.
    if (availability.updated.length > 0) {
      console.warn('FruitsFamily sync updated products:', JSON.stringify(availability.updated))
    }
    if (availability.deleteSuppressed.length > 0) {
      console.error('FruitsFamily sync held back deletions (too many at once):', availability.deleteSuppressed)
    }
    if (skipped.length > 0 || availability.skipped.length > 0) {
      console.error(summary, { skipped, availabilitySkipped: availability.skipped })
    } else {
      console.log(summary)
    }

    res.json({
      imported,
      skipped,
      deferred,
      soldOut: availability.soldOut,
      restocked: availability.restocked,
      deleted: availability.deleted,
      deleteSuppressed: availability.deleteSuppressed,
      updated: availability.updated,
      availabilitySkipped: availability.skipped,
      availabilityUnchecked: availability.unchecked
    })
  } catch (err) {
    if (err instanceof FruitsImportError) {
      console.error(`FruitsFamily sync aborted (${err.status}): ${err.message}`)
      // Availability updates above were already applied, so report them anyway.
      return res.status(err.status).json({
        error: err.message,
        soldOut: availability.soldOut,
        restocked: availability.restocked,
        deleted: availability.deleted
      })
    }
    console.error('FruitsFamily sync error:', err)
    res.status(500).json({ error: '동기화에 실패했습니다' })
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
