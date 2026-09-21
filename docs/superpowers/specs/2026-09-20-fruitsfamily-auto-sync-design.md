# TOKYO COLLECTIVE — FruitsFamily Auto-Sync

**Date:** 2026-09-20
**Status:** Approved (pending spec review)

## Purpose

Today, adding a product requires the admin to paste a FruitsFamily
product URL into the admin dashboard, click "가져오기" to preview the
scraped fields, then click "등록" to save it. The admin wants new
listings they post on FruitsFamily (fruitsfamily.com) to appear on the
Tokyo Collective homepage automatically, with no manual step at all.

FruitsFamily has no webhook or public API, so "automatic" means
polling the admin's public seller page on a schedule, detecting
listings not yet in our database, and importing + publishing them
immediately.

## Scope

- A new server endpoint that scans the seller page, diffs it against
  existing products, and auto-creates any new ones.
- A scheduled trigger (GitHub Actions cron) that calls this endpoint
  every 15 minutes.
- Refactor the existing single-product scraping logic (JSON-LD
  parsing in the `/api/admin/import-product` handler) into a shared
  function, reused by both the manual import flow and the new sync
  flow.

Out of scope: an admin review/draft queue (new items publish
immediately, per decision below), pagination beyond the seller page's
first/default view, and detecting price or stock changes on listings
already imported — this only adds products that aren't in our DB yet.

## Seller Page & Listing Discovery

Seller page: `https://fruitsfamily.com/seller/i9za/joongojoah`

This page (unlike the login-only `/my` page) renders product cards
server-side, including links matching:

```
/product/[id]/[url-encoded-korean-name]
```

Example: `/product/5pijr/%EC%8A%88%ED%94%84%EB%A6%BC-...`

The sync job fetches this page, extracts all `/product/[id]/...` links
via regex, and dedupes by `id`. The full detail-page URL
(`https://fruitsfamily.com/product/[id]/...`) becomes each candidate's
`external_url`.

## Data Flow

1. `GET` the seller page HTML.
2. Extract candidate product IDs + URLs from `/product/[id]/...` links.
3. Fetch all existing `external_url` values (`SELECT external_url FROM
   products WHERE external_url IS NOT NULL`) and extract each one's
   `[id]` segment with the same regex used in step 2, so a listing
   already imported is recognized even if its name/slug changed since
   import — skip any candidate whose `id` is in that set.
4. For each new candidate, fetch the product detail page and parse it
   with the existing JSON-LD extraction logic (same code path as
   manual import).
5. If parsing succeeds, `INSERT` it into `products` immediately
   (`stock` defaults to `1`) — it goes live on the homepage right
   away.
6. If parsing fails for one item, skip it and continue with the rest;
   it's retried automatically on the next 15-minute run since it's
   still "new" (not yet in the DB).
7. Respond with a JSON summary: `{ imported: [...], skipped: [...] }`.

## Components

- **`src/server/fruitsImport.js`** (new): extracts the JSON-LD
  scraping logic currently inline in `/api/admin/import-product` into
  an exported `fetchProductFromFruits(url)` function returning the
  same shape the endpoint returns today (`name`, `price`, `description`,
  `image_url`, `category`, `size`, `external_url`). Also exports
  `listNewFruitsListings(sellerUrl)`, which fetches the seller page and
  returns `[{ id, url }]` for every listing found.
- **`src/server/index.js`**:
  - `/api/admin/import-product` calls `fetchProductFromFruits` instead
    of inlining the scrape (no behavior change for manual import).
  - New route `POST /api/admin/sync-fruitsfamily`, protected by a
    `x-sync-secret` header checked against `process.env.SYNC_SECRET`
    (timing-safe compare, same pattern as admin token verification) —
    deliberately not `requireAdmin`, since this is called by GitHub
    Actions, not a logged-in browser session.
- **`.github/workflows/sync-fruitsfamily.yml`** (new): cron
  `*/15 * * * *`, calls the endpoint with `curl`, passing
  `SYNC_SECRET` from a GitHub Actions secret.
- **Env vars**: `SYNC_SECRET` added to Vercel production and to the
  repo's GitHub Actions secrets (same random value in both places).

## Error Handling

- Seller page fetch fails, or its HTML structure no longer matches the
  expected link pattern → the endpoint returns a 502 with no side
  effects; nothing is imported that run. The next scheduled run tries
  again — no manual recovery needed for a transient failure or a
  temporary markup change that self-resolves.
- A single product's detail-page fetch or JSON-LD parse fails → that
  product is recorded under `skipped` in the response and left out of
  the DB, so it's retried on the next run; the rest of the batch still
  proceeds.
- Wrong or missing `x-sync-secret` → 401, same as any other auth
  failure in this codebase.

## Testing

- Unit-level: feed `fetchProductFromFruits` and
  `listNewFruitsListings` saved HTML fixtures (a seller-page snippet
  with a few `/product/...` links, and a product-page snippet with a
  JSON-LD block) and confirm correct extraction, independent of any
  network call.
- Manual integration check: run `sync-fruitsfamily` against the real
  seller URL once after deploying, confirm it correctly finds zero new
  items (everything already imported) or correctly imports a
  deliberately-added test listing.
- Dedup check: run the sync endpoint twice in a row and confirm the
  second run imports nothing new.
