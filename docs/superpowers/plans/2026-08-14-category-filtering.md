# Category Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Header's existing `Outer`/`Top`/`Bottom`/`Acc` nav links to filter the product grid by category, with the active category highlighted and the piece count reflecting the filtered total.

**Architecture:** `App.vue` gains a `selectedCategory` ref and a `filteredProducts` computed. `Header.vue` emits a `select-category` event (payload: category string or `null`) on nav/wordmark clicks and receives an `activeCategory` prop to render active-state styling; `App.vue` listens for that event and updates `selectedCategory`. `ProductGrid.vue` needs no changes — it already renders whatever `products` array it's given, including an empty-state message when that array is empty.

**Tech Stack:** Vue 3 `<script setup>` SFCs, Vite, plain scoped CSS, Express (in-memory data, no DB).

**Spec:** `docs/superpowers/specs/2026-08-14-category-filtering-design.md`

## Global Constraints

- No routing library, no URL/query-string state, no multi-select filter UI.
- No changes to the Express API's response shape beyond adding one new `category` field per product, and no changes to existing `id`, `name`, `price`, `soldOut`, or `placeholderColor` values.
- Category values must be exactly `'Outer'`, `'Top'`, `'Bottom'`, `'Acc'` (matching the nav labels), mapped per the table in Task 1.
- This project has no automated test runner configured (`package.json` only defines `dev`/`build`/`preview`). Do not add one. Every task's verification step is a manual check against a running dev server, run with the API server started separately: `node src/server/index.js` in one terminal, `npm run dev` in another.
- `src/components/ProductGrid.vue` already has an empty-state branch (`v-else-if="!products.length"`, class `.empty`, message "No products in the archive right now.") from prior work. This branch fires whenever the `products` prop it receives is empty for any reason, including a category filter with no matches — no changes to `ProductGrid.vue` are needed or in scope for this plan.

---

### Task 1: Add category field to product data

**Files:**
- Modify: `src/server/index.js`

**Interfaces:**
- Produces: each object in the `products` array now has a `category` field (`'Outer' | 'Top' | 'Bottom' | 'Acc'`), consumed by Task 2's `filteredProducts` computed via `product.category`.

- [ ] **Step 1: Add the `category` field to each product**

In `src/server/index.js`, replace the `products` array with:

```js
const products = [
  { id: 1, name: 'VINTAGE CARGO PANTS', price: 89000, soldOut: false, placeholderColor: '#1a1a1a', category: 'Bottom' },
  { id: 2, name: 'SUPREME LOGO TEE', price: 125000, soldOut: true, placeholderColor: '#222', category: 'Top' },
  { id: 3, name: 'OVERSIZED KNIT SWEATER', price: 158000, soldOut: false, placeholderColor: '#151515', category: 'Top' },
  { id: 4, name: '90s DENIM JACKET', price: 210000, soldOut: false, placeholderColor: '#1d1d1d', category: 'Outer' },
  { id: 5, name: 'LEATHER MESSENGER BAG', price: 175000, soldOut: true, placeholderColor: '#111', category: 'Acc' },
  { id: 6, name: 'GRAFFITI PRINT HOODIE', price: 95000, soldOut: false, placeholderColor: '#1f1f1f', category: 'Outer' }
];
```

Everything else in the file (`id`, `name`, `price`, `soldOut`, `placeholderColor` values, the route handler, `app.listen`) is unchanged.

- [ ] **Step 2: Manually verify the API response**

Run `node src/server/index.js` in a terminal, then in another terminal run:

```bash
curl -s http://localhost:3000/api/products
```

Expected: JSON array of 6 products, each with a `category` field matching the table above (id 1 → `Bottom`, id 2 → `Top`, id 3 → `Top`, id 4 → `Outer`, id 5 → `Acc`, id 6 → `Outer`). Stop the server (Ctrl+C) when done.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.js
git commit -m "feat: add category field to product data"
```

---

### Task 2: Wire category filtering between App.vue and Header.vue

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/Header.vue`

**Interfaces:**
- Consumes: `product.category` from Task 1.
- Produces: `Header.vue` accepts a new prop `activeCategory: String` (default `null`) alongside its existing `count`/`loading`/`error` props, and emits `select-category` with a payload of `string | null`. `App.vue` owns `selectedCategory` (ref, default `null`) and `filteredProducts` (computed), and passes `filteredProducts` to `ProductGrid` in place of `products`.

- [ ] **Step 1: Add filtering state and computed to `App.vue`**

Replace the full contents of `src/App.vue` with:

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import Header from './components/Header.vue'
import ProductGrid from './components/ProductGrid.vue'
import Footer from './components/Footer.vue'

const products = ref([])
const loading = ref(true)
const error = ref(null)
const selectedCategory = ref(null)

const filteredProducts = computed(() => {
  if (selectedCategory.value === null) {
    return products.value
  }
  return products.value.filter(product => product.category === selectedCategory.value)
})

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
      <ProductGrid :products="filteredProducts" :loading="loading" :error="error" />
    </main>
    <Footer />
  </div>
</template>

<style>
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
```

- [ ] **Step 2: Rewrite `Header.vue` to emit selection events and show active state**

Replace the full contents of `src/components/Header.vue` with:

```vue
<script setup>
const categories = ['Outer', 'Top', 'Bottom', 'Acc']

const props = defineProps({
  count: {
    type: Number,
    default: 0
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  },
  activeCategory: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select-category'])

function selectCategory(category) {
  emit('select-category', props.activeCategory === category ? null : category)
}

function resetCategory() {
  emit('select-category', null)
}
</script>

<template>
  <header class="header">
    <div class="header-bar">
      <span class="wordmark" @click="resetCategory">TOKYO COLLECTIVE</span>
      <nav class="nav">
        <a
          v-for="category in categories"
          :key="category"
          href="#"
          class="nav-link"
          :class="{ active: activeCategory === category }"
          @click.prevent="selectCategory(category)"
        >{{ category }}</a>
      </nav>
    </div>
    <div class="header-intro">
      <h1 class="headline">ARCHIVE — TOKYO VINTAGE, CURATED</h1>
      <p v-show="!loading && !error" class="piece-count">{{ count }} pieces in rotation</p>
    </div>
  </header>
</template>

<style scoped>
.header {
  width: 100%;
  padding: 32px 0 40px;
  border-bottom: 1px solid var(--color-hairline);
  box-sizing: border-box;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40px;
}

.wordmark {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-paper);
  cursor: pointer;
}

.nav {
  display: flex;
  gap: 40px;
}

.nav-link {
  color: var(--color-ash);
  text-decoration: none;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
}

.nav-link:hover,
.nav-link.active {
  color: var(--color-patina);
}

.headline {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 500;
  font-size: 1.6rem;
  color: var(--color-paper);
  margin: 0 0 8px;
}

.piece-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-ash);
  margin: 0;
}

@media (max-width: 768px) {
  .header-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .nav {
    gap: 24px;
  }

  .headline {
    font-size: 1.2rem;
  }
}
</style>
```

- [ ] **Step 3: Manually verify filtering, active state, and reset**

Run `node src/server/index.js` and `npm run dev`, open the app.

Expected:
- Initially all 6 products show, no nav link is highlighted, count reads "6 pieces in rotation".
- Click `Outer`: grid shows only `90s DENIM JACKET` and `GRAFFITI PRINT HOODIE`, the `Outer` link turns patina-brass, count reads "2 pieces in rotation".
- Click `Outer` again: grid returns to all 6 products, no link highlighted, count reads "6 pieces in rotation".
- Click `Top`, then click the `TOKYO COLLECTIVE` wordmark: grid returns to all 6 products, no link highlighted.
- Click `Bottom`: grid shows only `VINTAGE CARGO PANTS` (1 item), count reads "1 pieces in rotation" (grammar is out of scope for this plan — matches existing behavior for singular counts).
- Resize below 768px: nav still wraps correctly and clicking still works.
- Open devtools console: no errors during any of the above.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue src/components/Header.vue
git commit -m "feat: wire category nav to filter product grid"
```

---

## Final Check

- [ ] **Step 1: Full walkthrough**

With both servers running, click through all four categories, the toggle-off behavior, and the wordmark reset, at both desktop and a narrow (< 768px) width. Confirm the empty-state message in `ProductGrid.vue` never renders during this walkthrough (every category has at least one product) — this is expected; the branch exists only as a safeguard, not something to reach.

- [ ] **Step 2: Grep for leftover hardcoded colors**

Run: `grep -rn "#000\|#ccc\|#888\|#222\|#444\|#151515\|#1a1a1a" src/components src/App.vue`
Expected: no matches (all UI colors still come from `var(--color-*)` tokens; the `#222`/`#151515`/`#1a1a1a` values that exist are `placeholderColor` data values in `src/server/index.js`, which is intentionally excluded from this grep path).
