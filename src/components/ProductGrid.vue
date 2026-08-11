<template>
  <div class="product-grid">
    <div v-if="loading" class="loading">Loading products...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-for="product in products" :key="product.id" class="product-item">
      <span class="catalog-number">No. {{ String(product.id).padStart(3, '0') }}</span>
      <div class="image-wrapper">
        <div class="placeholder-img" :style="{ backgroundColor: product.placeholderColor }">
          <span class="product-initial">{{ product.name.charAt(0) }}</span>
        </div>
      </div>
      <div class="product-info">
        <h3 class="product-name">{{ product.name }}</h3>
        <p class="product-price" :class="{ 'is-sold-out': product.soldOut }">
          ₩{{ product.price.toLocaleString() }}
          <span v-if="product.soldOut" class="sold-out">SOLD</span>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  products: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  }
})
</script>

<style scoped>
.product-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* 1px gap over a hairline background draws grid lines without per-cell borders */
  gap: 1px;
  background-color: var(--color-hairline);
  box-sizing: border-box;
  min-height: 400px;
}

.loading, .error {
  grid-column: 1 / -1;
  text-align: center;
  padding: 100px 0;
  color: var(--color-ash);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  background-color: var(--color-ink);
}

@media (max-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.product-item {
  background-color: var(--color-ink);
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  transition: background-color 0.2s ease;
}

.product-item:hover {
  background-color: var(--color-surface);
}

.product-item:hover .catalog-number,
.product-item:hover .product-name {
  color: var(--color-patina);
}

.product-item:hover .placeholder-img {
  filter: brightness(1.15);
}

.catalog-number {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-ash);
  margin-bottom: 8px;
  transition: color 0.2s ease;
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
  transition: filter 0.2s ease;
}

.product-initial {
  color: rgba(0, 0, 0, 0.3);
  font-size: 5rem;
  font-weight: 800;
}

.product-info {
  padding-top: 12px;
  text-align: left;
}

.product-name {
  font-family: var(--font-body);
  color: var(--color-paper);
  font-size: 0.75rem;
  font-weight: 700;
  margin: 0 0 4px;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  transition: color 0.2s ease;
}

.product-price {
  font-family: var(--font-mono);
  color: var(--color-ash);
  font-size: 0.75rem;
  font-weight: 400;
  margin: 0;
}

.product-price.is-sold-out {
  text-decoration: line-through;
}

.sold-out {
  display: inline-block;
  color: var(--color-patina);
  font-weight: 500;
  margin-left: 8px;
  text-transform: uppercase;
  font-size: 0.7rem;
  text-decoration: none;
}
</style>
