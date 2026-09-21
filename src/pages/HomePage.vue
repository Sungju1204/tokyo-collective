<script setup>
import { ref, computed, onMounted } from 'vue'
import Header from '../components/Header.vue'
import ProductGrid from '../components/ProductGrid.vue'
import Footer from '../components/Footer.vue'

const products = ref([])
const loading = ref(true)
const error = ref(null)
const selectedCategory = ref(null)

const filteredProducts = computed(() => {
  const filtered = selectedCategory.value === null
    ? products.value
    : products.value.filter(product => product.category === selectedCategory.value)
  return [...filtered].sort((a, b) => Number(a.soldOut) - Number(b.soldOut))
})

const fetchProducts = async () => {
  try {
    loading.value = true
    const response = await fetch('/api/products')
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

function handleSelectCategory(category) {
  selectedCategory.value = category
}

onMounted(() => {
  fetchProducts()
})
</script>

<template>
  <div class="app-container">
    <Header
      :count="filteredProducts.length"
      :loading="loading"
      :error="error"
      :active-category="selectedCategory"
      @select-category="handleSelectCategory"
    />
    <main class="main-content">
      <ProductGrid
        :products="filteredProducts"
        :loading="loading"
        :error="error"
      />
    </main>
    <Footer />
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  padding: 0 40px;
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: 40px 0;
}

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--color-ink);
}

::-webkit-scrollbar-thumb {
  background: var(--color-hairline);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-patina);
}
</style>
