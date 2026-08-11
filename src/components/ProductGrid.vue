<template>
  <div class="product-grid">
    <div v-if="loading" class="loading">Loading products...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-for="product in products" :key="product.id" class="product-item">
      <div class="image-wrapper">
        <div class="placeholder-img" :style="{ backgroundColor: product.placeholderColor }">
          <span class="product-initial">{{ product.name.charAt(0) }}</span>
        </div>
      </div>
      <div class="product-info">
        <h3 class="product-name">{{ product.name }}</h3>
        <p class="product-price">
          ₩{{ product.price.toLocaleString() }}
          <span v-if="product.soldOut" class="sold-out">Sold Out</span>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const products = ref([])
const loading = ref(true)
const error = ref(null)

const fetchProducts = async () => {
  try {
    loading.value = true
    const response = await fetch('http://localhost:3000/api/products')
    if (!response.ok) {
      throw new Error('Failed to fetch products')
    }
    products.value = await response.json()
  } catch (err) {
    error.value = '상품 데이터를 불러오는 중 오류가 발생했습니다.'
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchProducts()
})
</script>

<style scoped>
.product-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  background-color: #000;
  box-sizing: border-box;
  min-height: 400px;
}

.loading, .error {
  grid-column: 1 / -1;
  text-align: center;
  padding: 100px 0;
  color: #888;
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.product-item {
  background-color: #000;
  display: flex;
  flex-direction: column;
}

.image-wrapper {
  aspect-ratio: 1 / 1;
  width: 100%;
  overflow: hidden;
}

.placeholder-img {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-initial {
  color: #333;
  font-size: 5rem;
  font-weight: 800;
}

.product-info {
  padding: 10px;
  text-align: left;
}

.product-name {
  color: #ccc;
  font-size: 0.75rem;
  font-weight: 700;
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}

.product-price {
  color: #888;
  font-size: 0.7rem;
  font-weight: 400;
  margin: 0;
}

.sold-out {
  color: #ff0000;
  font-weight: 700;
  margin-left: 5px;
  text-transform: uppercase;
  font-size: 0.65rem;
}
</style>
