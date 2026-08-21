<template>
  <div class="product-grid">
    <div v-if="loading" class="loading">Loading products...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!products.length" class="empty">No products in the archive right now.</div>
    <div v-for="product in products" :key="product.id" class="product-item" :class="{ 'is-sold-out': product.soldOut }">
      <span class="catalog-number">No. {{ String(product.id).padStart(3, '0') }}</span>
      <div class="image-wrapper">
        <img v-if="product.image_url" :src="product.image_url" :alt="product.name" class="product-image" />
        <div v-else class="placeholder-img" :style="{ backgroundColor: product.placeholderColor }">
          <span class="product-initial">{{ product.name.charAt(0) }}</span>
        </div>
      </div>
      <div class="product-info">
        <h3 class="product-name">{{ product.name }}</h3>
        <p v-if="product.size" class="product-size">SIZE {{ product.size }}</p>
        <p v-if="product.description" class="product-description">{{ product.description }}</p>
        <p class="product-price" :class="{ 'is-sold-out': product.soldOut }">
          ₩{{ product.price.toLocaleString() }}
          <span v-if="product.soldOut" class="sold-out">SOLD</span>
        </p>
        <button
          v-if="!product.soldOut && product.external_url"
          class="btn-add-to-cart"
          @click="handleBuyClick(product)"
        >
          구매하기
        </button>
        <p v-else-if="!product.soldOut" class="link-pending">링크 준비중</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
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

function handleBuyClick(product) {
  if (!product.soldOut && product.external_url) {
    window.open(product.external_url, '_blank', 'noopener')
  }
}
</script>

<style scoped>
.product-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* 1px gap; each .product-item draws its own hairline via box-shadow so
     empty trailing cells (e.g. row 2 with 6 items in a 4-col grid) stay
     ink-colored instead of painting a solid hairline slab. */
  gap: 1px;
  background-color: var(--color-ink);
  box-sizing: border-box;
  min-height: 400px;
}

.loading, .error, .empty {
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
  /* Adjacent shadows coincide into a continuous 1px hairline across the
     grid's gap, without painting empty trailing cells. */
  box-shadow: 0 0 0 1px var(--color-hairline);
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
  filter: brightness(1.6);
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

.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-initial {
  /* --color-paper (#ECE7DD) at low alpha, so the initial reads against the
     near-black placeholderColor values served by the API. */
  color: rgba(236, 231, 221, 0.14);
  font-size: 5rem;
  font-weight: 700;
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

.product-size {
  font-family: var(--font-mono);
  color: var(--color-ash);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  margin: 0 0 4px;
}

.product-description {
  font-family: var(--font-body);
  color: var(--color-ash);
  font-size: 0.7rem;
  line-height: 1.4;
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.product-item.is-sold-out {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-add-to-cart {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--color-ink);
  color: var(--color-paper);
  border: 1px solid var(--color-hairline);
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-to-cart:hover {
  background: var(--color-paper);
  color: var(--color-ink);
  border-color: var(--color-paper);
}

.link-pending {
  margin-top: 12px;
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--color-ash);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

@media (max-width: 768px) {
  .btn-add-to-cart {
    font-size: 0.65rem;
    padding: 6px 10px;
  }
}
</style>
