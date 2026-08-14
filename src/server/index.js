import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const products = [
  { id: 1, name: 'VINTAGE CARGO PANTS', price: 89000, soldOut: false, placeholderColor: '#1a1a1a', category: 'Bottom' },
  { id: 2, name: 'SUPREME LOGO TEE', price: 125000, soldOut: true, placeholderColor: '#222', category: 'Top' },
  { id: 3, name: 'OVERSIZED KNIT SWEATER', price: 158000, soldOut: false, placeholderColor: '#151515', category: 'Top' },
  { id: 4, name: '90s DENIM JACKET', price: 210000, soldOut: false, placeholderColor: '#1d1d1d', category: 'Outer' },
  { id: 5, name: 'LEATHER MESSENGER BAG', price: 175000, soldOut: true, placeholderColor: '#111', category: 'Acc' },
  { id: 6, name: 'GRAFFITI PRINT HOODIE', price: 95000, soldOut: false, placeholderColor: '#1f1f1f', category: 'Outer' }
];

const ordersFilePath = path.join(__dirname, 'orders.json');

// Load orders from file
function loadOrders() {
  try {
    if (fs.existsSync(ordersFilePath)) {
      const data = fs.readFileSync(ordersFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading orders:', err);
  }
  return [];
}

// Save orders to file
function saveOrders(orders) {
  try {
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Error saving orders:', err);
  }
}

let orders = loadOrders();

// Get all products
app.get('/api/products', (req, res) => {
  res.json(products);
});

// Create new order
app.post('/api/orders', (req, res) => {
  try {
    const { customer, items } = req.body;

    if (!customer || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Never trust client-supplied price/status: recompute from the server-side catalog.
    const resolvedItems = [];
    let totalPrice = 0;
    for (const item of items) {
      const product = products.find(p => p.id === item.id);
      const quantity = Number(item.quantity);
      if (!product || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ error: `Invalid item: ${item?.id}` });
      }
      resolvedItems.push({ id: product.id, name: product.name, price: product.price, quantity });
      totalPrice += product.price * quantity;
    }

    const orderId = `ORD-${Date.now()}`;
    const newOrder = {
      id: orderId,
      customer,
      items: resolvedItems,
      totalPrice,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paymentStatus: 'pending'
    };

    orders.push(newOrder);
    saveOrders(orders);

    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get order by ID
app.get('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json(order);
});

// Get all orders
app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// Update order (customer-cancellable status only; paymentStatus/totalPrice are server-controlled)
const CANCELLABLE_STATUSES = ['pending', 'cancelled'];

app.patch('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const { status } = req.body;
  if (!CANCELLABLE_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${CANCELLABLE_STATUSES.join(', ')}` });
  }

  order.status = status;
  saveOrders(orders);

  res.json(order);
});

app.listen(port, () => {
  console.log(`✅ 빈티지 샵 API 서버 실행 중 → http://localhost:${port}`);
});
