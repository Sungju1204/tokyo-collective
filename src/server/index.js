import express from 'express';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors());

const products = [
  { id: 1, name: 'VINTAGE CARGO PANTS', price: 89000, soldOut: false, placeholderColor: '#1a1a1a' },
  { id: 2, name: 'SUPREME LOGO TEE', price: 125000, soldOut: true, placeholderColor: '#222' },
  { id: 3, name: 'OVERSIZED KNIT SWEATER', price: 158000, soldOut: false, placeholderColor: '#151515' },
  { id: 4, name: '90s DENIM JACKET', price: 210000, soldOut: false, placeholderColor: '#1d1d1d' },
  { id: 5, name: 'LEATHER MESSENGER BAG', price: 175000, soldOut: true, placeholderColor: '#111' },
  { id: 6, name: 'GRAFFITI PRINT HOODIE', price: 95000, soldOut: false, placeholderColor: '#1f1f1f' }
];

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.listen(port, () => {
  console.log(`✅ 빈티지 샵 API 서버 실행 중 → http://localhost:${port}`);
});
