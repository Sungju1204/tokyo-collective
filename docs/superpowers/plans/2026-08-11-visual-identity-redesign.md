# TOKYO COLLECTIVE Visual Identity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Header, ProductGrid, and Footer with the approved patina/ink color palette, Fraunces/Plex typography, and catalog-number signature element, per the approved design spec.

**Architecture:** Design tokens (CSS custom properties + Google Fonts) are established once in `src/assets/base.css` and `index.html`, then consumed by every component. `App.vue` is refactored to own the product fetch and pass `products`/`loading`/`error` down as props, so both `Header` (piece count) and `ProductGrid` (listing) read from one source. Each of the three visible components is then restyled against the shared tokens.

**Tech Stack:** Vue 3 `<script setup>` SFCs, Vite, plain scoped CSS (no CSS framework), Google Fonts CDN.

**Spec:** `docs/superpowers/specs/2026-08-11-visual-identity-redesign-design.md`

## Global Constraints

- Do not change the Express API (`src/server/index.js`) or the product data shape (`id`, `name`, `price`, `soldOut`, `placeholderColor`).
- No new pages or routes. Only `Header.vue`, `ProductGrid.vue`, `Footer.vue`, `App.vue`, `base.css`, and `index.html` change.
- Preserve the existing `768px` grid breakpoint (2 columns instead of 4).
- Preserve the existing Korean error message text (`'상품 데이터를 불러오는 중 오류가 발생했습니다.'`) and loading/error UX behavior.
- This project has no automated test runner configured (`package.json` only defines `dev`/`build`/`preview`). Do not add one. Every task's verification step is a manual check against a running dev server, run with the API server started separately: `node src/server/index.js` in one terminal, `npm run dev` in another.
- Catalog numbers are `No. ` + `product.id` zero-padded to 3 digits (e.g. id `1` → `No. 001`).

---

### Task 1: Design tokens and Google Fonts

**Files:**
- Modify: `index.html`
- Modify: `src/assets/base.css`

**Interfaces:**
- Produces: CSS custom properties available globally to every component: `--color-ink`, `--color-paper`, `--color-ash`, `--color-patina`, `--color-hairline`, `--color-surface`, `--font-display`, `--font-body`, `--font-mono`. Later tasks reference these by name — do not rename them.

- [ ] **Step 1: Add Google Fonts and update the page title in `index.html`**

Replace the full contents of `index.html` with:

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TOKYO COLLECTIVE</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Define design tokens in `src/assets/base.css`**

Replace the full contents of `src/assets/base.css` with:

```css
:root {
  --color-ink: #0B0B0A;
  --color-paper: #ECE7DD;
  --color-ash: #8D8878;
  --color-patina: #B08D57;
  --color-hairline: #262420;
  --color-surface: #131210;

  --font-display: 'Fraunces', serif;
  --font-body: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--color-ink);
  color: var(--color-paper);
  font-family: var(--font-body);
}
```

- [ ] **Step 3: Manually verify fonts and tokens load**

Run: `npm run dev`, open the printed local URL in a browser.
Expected: page background is near-black, body text (if any is visible, e.g. via browser devtools) renders in IBM Plex Sans. Open devtools → Network tab → confirm requests to `fonts.googleapis.com` / `fonts.gstatic.com` succeed (status 200). Open devtools → Elements → confirm `:root` computed styles include `--color-patina: #B08D57`.

- [ ] **Step 4: Commit**

```bash
git add index.html src/assets/base.css
git commit -m "feat: add design tokens and Google Fonts for visual identity redesign"
```

---

### Task 2: Lift product fetch into App.vue

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/ProductGrid.vue` (script only)

**Interfaces:**
- Consumes: tokens from Task 1 (`--color-ink`, `--color-hairline`, `--color-patina`).
- Produces: `ProductGrid` now declares props `products: Array` (default `[]`), `loading: Boolean` (default `false`), `error: String` (default `null`) instead of fetching internally. `App.vue` exposes a `products` ref (via its own `fetchProducts()`) that Task 3 will also read for the header's piece count.

- [ ] **Step 1: Move the fetch logic into `App.vue`**

Replace the full contents of `src/App.vue` with:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import Header from './components/Header.vue'
import ProductGrid from './components/ProductGrid.vue'
import Footer from './components/Footer.vue'

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

<template>
  <div class="app-container">
    <Header />
    <main class="main-content">
      <ProductGrid :products="products" :loading="loading" :error="error" />
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

- [ ] **Step 2: Make `ProductGrid` receive data via props instead of fetching**

In `src/components/ProductGrid.vue`, replace the `<script setup>` block only (leave `<template>` and `<style>` untouched for now — they're rewritten in Task 4) with:

```vue
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
```

- [ ] **Step 3: Manually verify data still flows correctly**

Run `node src/server/index.js` in one terminal and `npm run dev` in another, open the app in a browser.
Expected: the 6 hardcoded products still render (old visual style is fine at this point — only the data path changed). Open devtools console: no errors. Stop the `node src/server/index.js` process, reload the page, and confirm the Korean error message (`상품 데이터를 불러오는 중 오류가 발생했습니다.`) appears in place of the grid.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue src/components/ProductGrid.vue
git commit -m "refactor: lift product fetch into App.vue and pass down as props"
```

---

### Task 3: Redesign Header

**Files:**
- Modify: `src/components/Header.vue`
- Modify: `src/App.vue` (one line)

**Interfaces:**
- Consumes: tokens from Task 1; `products`/`loading`/`error` state pattern from Task 2.
- Produces: `Header` now declares props `count: Number` (default `0`), `loading: Boolean` (default `false`), and `error: String` (default `null`).

- [ ] **Step 1: Pass the piece count down from `App.vue`**

In `src/App.vue`, change the `<Header />` line inside `<template>` to:

```vue
    <Header :count="products.length" :loading="loading" :error="error" />
```

- [ ] **Step 2: Rewrite `Header.vue`**

Replace the full contents of `src/components/Header.vue` with:

```vue
<script setup>
defineProps({
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
  }
})
</script>

<template>
  <header class="header">
    <div class="header-bar">
      <span class="wordmark">TOKYO COLLECTIVE</span>
      <nav class="nav">
        <a href="#" class="nav-link">Outer</a>
        <a href="#" class="nav-link">Top</a>
        <a href="#" class="nav-link">Bottom</a>
        <a href="#" class="nav-link">Acc</a>
      </nav>
    </div>
    <div class="header-intro">
      <h1 class="headline">ARCHIVE — TOKYO VINTAGE, CURATED</h1>
      <p v-if="!loading && !error" class="piece-count">{{ count }} pieces in rotation</p>
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

.nav-link:hover {
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

- [ ] **Step 3: Manually verify the header**

Run `node src/server/index.js` and `npm run dev`, open the app.
Expected: logo is now the "TOKYO COLLECTIVE" wordmark in Fraunces (serif), nav links are right-aligned on the same row, below it the italic headline "ARCHIVE — TOKYO VINTAGE, CURATED" appears with "6 pieces in rotation" underneath in monospace. Resize the browser below 768px width and confirm the bar stacks vertically without overlapping text. Then stop the `node src/server/index.js` process and reload: confirm the piece-count line disappears (not "0 pieces in rotation") while the grid below shows its error message.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue src/components/Header.vue
git commit -m "feat: redesign Header with wordmark, nav bar, and piece count"
```

---

### Task 4: Redesign ProductGrid (signature element)

**Files:**
- Modify: `src/components/ProductGrid.vue` (template and style only — script from Task 2 stays as-is)

**Interfaces:**
- Consumes: tokens from Task 1; `products`/`loading`/`error` props from Task 2.

- [ ] **Step 1: Rewrite the `<template>` and `<style>` of `ProductGrid.vue`**

Replace everything in `src/components/ProductGrid.vue` **below** the existing `<script setup>` block with:

```vue
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
```

- [ ] **Step 2: Manually verify the grid**

Run `node src/server/index.js` and `npm run dev`, open the app.
Expected: 6 products in a 4-column grid separated by thin hairlines (no card backgrounds), each with a `No. 001`–`No. 006` label above the image. Hover a product: catalog number and name turn patina-brass, the placeholder image brightens, row background tints. The `SUPREME LOGO TEE` (id 2) and `LEATHER MESSENGER BAG` (id 5) show a struck-through price with a patina "SOLD" label. Resize below 768px and confirm 2 columns.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProductGrid.vue
git commit -m "feat: redesign ProductGrid with catalog numbers and hairline layout"
```

---

### Task 5: Redesign Footer

**Files:**
- Modify: `src/components/Footer.vue`

**Interfaces:**
- Consumes: tokens from Task 1.

- [ ] **Step 1: Rewrite `Footer.vue`**

Replace the full contents of `src/components/Footer.vue` with:

```vue
<template>
  <footer class="footer">
    <p class="copyright">&copy; TOKYO COLLECTIVE ALL RIGHTS RESERVED.</p>
    <div class="social-links">
      <a href="#" class="footer-link">Instagram</a>
      <a href="#" class="footer-link">Fruits Family</a>
      <a href="#" class="footer-link">Bunjang</a>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  width: 100%;
  padding: 32px 0 40px;
  border-top: 1px solid var(--color-hairline);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.copyright {
  font-family: var(--font-mono);
  color: var(--color-ash);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  margin: 0;
}

.social-links {
  display: flex;
  gap: 20px;
}

.footer-link {
  color: var(--color-ash);
  text-decoration: none;
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  transition: color 0.2s ease;
}

.footer-link:hover {
  color: var(--color-patina);
}
</style>
```

- [ ] **Step 2: Manually verify the footer**

Run `node src/server/index.js` and `npm run dev`, open the app, scroll to the bottom.
Expected: a hairline divider above the footer, copyright text (monospace) on the left, social links on the right, links turn patina-brass on hover. Narrow the browser and confirm the row wraps instead of overlapping.

- [ ] **Step 3: Commit**

```bash
git add src/components/Footer.vue
git commit -m "feat: redesign Footer with split layout and hairline divider"
```

---

## Final Check

- [ ] **Step 1: Full walkthrough**

With both servers running, walk through the whole page top to bottom at desktop width and at a narrow (< 768px) width. Confirm: fonts loaded (Fraunces wordmark/headline, Plex Sans nav/names, Plex Mono prices/numbers/count/copyright), palette matches the tokens (no leftover `#000`/`#ccc`/`#888` hardcoded colors), catalog numbers `No. 001`–`No. 006` are present and unique, sold-out items show struck-through price + patina "SOLD", hover states work on nav links, product rows, and footer links.

- [ ] **Step 2: Grep for leftover hardcoded colors**

Run: `grep -rn "#000\|#ccc\|#888\|#222\|#444\|#151515\|#1a1a1a" src/components src/App.vue`
Expected: no matches (all colors now come from `var(--color-*)` tokens or product `placeholderColor` data, which is intentionally per-product and out of scope).
