# TOKYO COLLECTIVE — Category Filtering

**Date:** 2026-08-14
**Status:** Approved (pending spec review)

## Purpose

The Header's nav bar already displays four category links —
`Outer`, `Top`, `Bottom`, `Acc` — but they are dead (`href="#"`) and
do nothing. This feature wires them up to actually filter the product
grid by category, completing an existing UI affordance rather than
adding a new one.

## Scope

- Add a `category` field to the hardcoded product data in
  `src/server/index.js`.
- Add category filtering state to `App.vue`, driven by clicks on the
  Header's nav links.
- Update `Header.vue` to emit category selection/reset events and
  show which category (if any) is active.
- Update `ProductGrid.vue` to show a small empty-state message when a
  filtered category has no products.

No routing library, no URL/query-string state, no multi-select filter
UI. No changes to the Express API's response shape beyond adding the
one new field, and no changes to product ids, names, prices, or
`soldOut`/`placeholderColor` values.

## Data Model

`src/server/index.js`'s in-memory `products` array gets one new field
per product, `category`, using the same string values as the nav
labels (`'Outer'`, `'Top'`, `'Bottom'`, `'Acc'`):

| id | name | category |
|---|---|---|
| 1 | VINTAGE CARGO PANTS | Bottom |
| 2 | SUPREME LOGO TEE | Top |
| 3 | OVERSIZED KNIT SWEATER | Top |
| 4 | 90s DENIM JACKET | Outer |
| 5 | LEATHER MESSENGER BAG | Acc |
| 6 | GRAFFITI PRINT HOODIE | Outer |

## Data Flow

`App.vue` already owns `products`/`loading`/`error` (from the prior
lift-state refactor). This feature adds one more piece of state,
`selectedCategory` (a ref, initial value `null` meaning "show all"),
and a `filteredProducts` computed:

```
filteredProducts = selectedCategory === null
  ? products
  : products.filter(p => p.category === selectedCategory)
```

- `ProductGrid` receives `filteredProducts` (instead of `products`)
  as its `products` prop. Its `loading`/`error` props are unchanged
  and still reflect the underlying fetch, not the filter.
- `Header` receives `count={filteredProducts.length}` (so the piece
  count reflects the active filter) and a new `activeCategory` prop
  (`selectedCategory`'s current value).
- `Header` emits a `select-category` event carrying either a category
  string or `null`. `App.vue` listens and sets `selectedCategory`
  directly from the payload — no toggle logic in `App.vue`; the
  toggle decision (same category → deselect) lives in `Header`, since
  it's the component that knows which link was clicked and what's
  currently active.

## Component Design: Header

- Each nav `<a>` becomes a `<button class="nav-link">`-style element
  (keeps existing visual styling, but semantically a click action
  rather than a dead link) with a click handler:
  - If the clicked category equals `activeCategory`, emit
    `select-category` with `null` (deselect → show all).
  - Otherwise, emit `select-category` with the clicked category.
- The wordmark (`TOKYO COLLECTIVE`) becomes clickable too (cursor:
  pointer), always emitting `select-category` with `null` — a direct
  "back to all" action regardless of current state.
- Active-state styling: the nav link matching `activeCategory` gets a
  `.active` class rendering it in `--color-patina` (same tone as the
  existing hover color, so "selected" reads consistently with
  "hovering").
- No changes to the headline or piece-count line beyond the count now
  reflecting the filtered total; the `!loading && !error` guard on
  showing the count line is unchanged.

## Component Design: ProductGrid

- No change to how products are rendered per item.
- New empty-state branch: when `!loading && !error && products.length
  === 0`, render a message (styled like the existing `.loading`/
  `.error` states — centered, `--color-ash`, mono font) such as "No
  pieces in this category yet." This is defensive: with the current 6
  products every category has at least one item, so this state isn't
  reachable today, but it prevents a blank grid if that ever changes.

## Error Handling

Unchanged fetch error behavior (Korean error message, no count
shown). Category filtering only operates on already-fetched data, so
it introduces no new error states beyond the empty-category message
above.

## Testing

No automated test runner in this project (consistent with the prior
redesign work). Manual verification with both servers running
(`node src/server/index.js` and `npm run dev`):

- Click each nav link (`Outer`/`Top`/`Bottom`/`Acc`) and confirm the
  grid shows only matching products, the nav link turns patina, and
  the piece count updates to match.
- Click the same active nav link again and confirm it deselects (grid
  and count return to all 6 products, no nav link active).
- Click the wordmark while a category is active and confirm it resets
  to all products.
- Confirm this works identically at desktop and mobile (`<768px`)
  widths, where the nav already wraps.
