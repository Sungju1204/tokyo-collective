# TOKYO COLLECTIVE — Visual Identity Redesign

**Date:** 2026-08-11
**Status:** Approved (pending spec review)

## Purpose

The current site (Header, ProductGrid, Footer) uses a generic dark
minimal look: flat `#000` background, gray text, plain 4-column card
grid. The goal is a distinctive "premium minimal gallery" identity for
a Tokyo vintage-clothing shop — grounded in vintage-archive vernacular
(patina, catalog numbering, gallery labeling) rather than a generic
dark theme.

## Scope

Restyle the three existing components only:
`src/components/Header.vue`, `src/components/ProductGrid.vue`,
`src/components/Footer.vue`, plus shared global tokens (colors, fonts)
in `src/assets`. No new pages, routes, or backend changes. The Express
API (`src/server/index.js`) and its response shape are unchanged.

## Design Tokens

### Color

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#0B0B0A` | Page background |
| `--color-paper` | `#ECE7DD` | Primary text |
| `--color-ash` | `#8D8878` | Secondary text (prices, nav) |
| `--color-patina` | `#B08D57` | Accent — hover states, catalog numbers, sold indicator |
| `--color-hairline` | `#262420` | Dividers, borders (replaces solid card backgrounds) |
| `--color-surface` | `#131210` | Hover surface for product rows |

Rationale: near-black ink instead of flat `#000`; a warm brass/patina
accent (evokes aged hardware, sepia photographs) instead of the more
common near-black + acid-green/vermilion pairing.

### Typography

| Role | Typeface | Used for |
|---|---|---|
| Display | Fraunces (serif, italic for accents) | Logo wordmark, section headline |
| Body/UI | IBM Plex Sans | Nav links, product names, copy |
| Utility/Mono | IBM Plex Mono | Prices, catalog numbers, footer copyright |

Fonts load via Google Fonts in `index.html`. Plex Sans and Plex Mono
share a family, giving nav/labels and prices/numbers a consistent,
systemic "archival tag" feel; Fraunces gives the wordmark and headline
more character than the current Helvetica default.

## Component Designs

### Header

- Layout switches from centered/stacked to a slim left–right bar:
  logo (Fraunces wordmark, left) and nav links (Plex Sans, uppercase,
  right), on one row.
- Border under the header becomes a 1px `--color-hairline` instead of
  the current `#222` block.
- A new sub-line is added below the bar: an editorial headline
  ("ARCHIVE — TOKYO VINTAGE, CURATED" in Fraunces italic) plus a small
  Plex Mono line showing the live piece count, e.g. `"6 pieces in
  rotation"` computed from the fetched product list (not hardcoded).
  This count needs to come from `ProductGrid`'s fetch result, so
  `App.vue` will lift the `products` fetch (or the resulting count)
  up so both `Header` and `ProductGrid` can use it — see Data Flow
  below.

### ProductGrid (signature element)

- Cards lose their solid background; each item is separated by a
  `--color-hairline` rule instead of a card surface.
- Each product gets a catalog number rendered in Plex Mono:
  `No. 0XX`, computed as the product's `id` zero-padded to 3 digits
  (`No. 001`, `No. 002`, …). This mirrors how vintage stock is
  physically tagged and gives the numbering real meaning (a stable
  per-item identifier) rather than a decorative sequence.
- Price renders in Plex Mono (tabular figures) in `--color-ash`.
- Sold-out items: remove the red "Sold Out" pill; instead show
  `SOLD` in `--color-patina` next to the price, and strike through the
  price.
- Hover state: catalog number and the item's underline transition to
  `--color-patina`; the placeholder image brightens slightly. No
  background card appears on hover — the row surface tints to
  `--color-surface` instead.
- Loading/error states keep their current behavior, restyled with the
  new tokens (no functional change).

### Footer

- Switches from centered/stacked to a left–right split: copyright
  (Plex Mono, left) and social links (Plex Sans, right), separated
  from the page above by a `--color-hairline` top border instead of
  pure spacing.

## Data Flow

`ProductGrid.vue` already owns `fetchProducts()` and `products`.
Since the Header's piece count needs the same data, `App.vue` lifts
the fetch: `products`/`loading`/`error` state move to `App.vue`,
fetched once in `onMounted`, and passed down as props to both
`Header` (for the count) and `ProductGrid` (for rendering). This is
the one structural change beyond styling — it's necessary because two
sibling components now need the same data, and duplicating the fetch
would risk the header and grid showing different counts.

No changes to the Express API or the product data shape.

## Error Handling

Unchanged from current behavior: fetch failure shows the existing
Korean error message in the grid area. The header's piece count shows
nothing (or omits the line) while `loading` is true or `error` is
set, since there's no reliable count to display yet.

## Testing

This is a visual/CSS-focused change with one small structural change
(lifting fetch state). Verification is manual:

- Run `npm run dev` (and the API server) and visually confirm each
  component against this spec at desktop and mobile widths (grid
  already has a `768px` breakpoint to preserve).
- Confirm the header count matches the number of rendered product
  cards.
- Confirm sold-out styling and hover states.

No existing automated test suite covers these components, so no new
test infrastructure is introduced for this change.
