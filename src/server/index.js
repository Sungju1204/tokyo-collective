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
    const { customer, items, totalPrice, status } = req.body;

    if (!customer || !items || totalPrice === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orderId = `ORD-${Date.now()}`;
    const newOrder = {
      id: orderId,
      customer,
      items,
      totalPrice,
      status: status || 'pending',
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

// Update order (for payment status, etc.)
app.patch('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  Object.assign(order, req.body);
  saveOrders(orders);

  res.json(order);
});

app.listen(port, () => {
  console.log(`✅ 빈티지 샵 API 서버 실행 중 → http://localhost:${port}`);
});
