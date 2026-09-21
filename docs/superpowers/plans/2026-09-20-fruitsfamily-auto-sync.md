# FruitsFamily Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect new product listings on the admin's FruitsFamily seller page and publish them to the Tokyo Collective homepage without any manual admin action.

**Architecture:** A shared scraping module (`fruitsImport.js`) provides listing-discovery and single-product-parsing functions. The existing manual "import from URL" admin endpoint is refactored to use it. A new secret-protected endpoint uses the same module to diff the seller page against the DB and auto-insert anything new. A GitHub Actions cron calls that endpoint every 15 minutes.

**Tech Stack:** Node.js/Express (`src/server/index.js`), `@libsql/client` (SQLite locally, Turso in production), Vitest (new dev dependency, added in Task 1) for unit tests, GitHub Actions for scheduling.

**Spec:** `docs/superpowers/specs/2026-09-20-fruitsfamily-auto-sync-design.md`

## Global Constraints

- Seller page to poll: `https://fruitsfamily.com/seller/i9za/joongojoah` (from the spec's "Seller Page & Listing Discovery" section).
- Only `fruitsfamily.com` and `www.fruitsfamily.com` are allowed hosts for any scrape (existing `IMPORT_ALLOWED_HOSTS` behavior must be preserved).
- New listings are published immediately on detection — no draft/review queue (spec's Purpose/Scope decision).
- Sync runs every 15 minutes via GitHub Actions, not Vercel Cron (spec's Architecture section, chosen to avoid Vercel Hobby plan's daily-only cron limit).
- The manual `/api/admin/import-product` endpoint's request/response shape and error messages must not change — it's a refactor, not a behavior change (spec's Scope section).
- New product IDs are recognized by extracting the `[id]` segment from `/product/[id]/...` URLs, not by exact URL string match, since a listing's slug can change (spec's Data Flow step 3).

---

### Task 1: Add Vitest and extract scraping logic into `fruitsImport.js`

**Files:**
- Create: `src/server/fruitsImport.js`
- Create: `src/server/fruitsImport.test.js`
- Modify: `package.json` (add `vitest` devDependency and a `test` script)

**Interfaces:**
- Produces (used by Tasks 2 and 3):
  - `export const IMPORT_ALLOWED_HOSTS: string[]` — `['fruitsfamily.com', 'www.fruitsfamily.com']`
  - `export class FruitsImportError extends Error { constructor(message: string, status: number); status: number }`
  - `export async function fetchProductFromFruits(urlString: string): Promise<{ name: string, price: number|string, description: string, image_url: string, category: string, size: string, external_url: string }>` — throws `FruitsImportError` on any failure.
  - `export function extractProductId(urlOrPath: string): string | null`
  - `export async function listNewFruitsListings(sellerUrl: string): Promise<Array<{ id: string, url: string }>>` — throws `FruitsImportError` on fetch failure; returns `[]` if the page loads but no product links are found.

- [ ] **Step 1: Install Vitest and add the test script**

```bash
npm install --save-dev vitest
```

Edit `package.json`'s `"scripts"` block to add:

```json
    "test": "vitest run",
```

- [ ] **Step 2: Write the failing tests**

Create `src/server/fruitsImport.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchProductFromFruits,
  extractProductId,
  listNewFruitsListings,
  FruitsImportError
} from './fruitsImport.js'

const PRODUCT_HTML = `
<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"슈프림 조던 후드집업","offers":{"price":"120000"},"description":"오버사이즈 핏","image":["https://img.fruitsfamily.com/5pijr-1.jpg"],"category":"아우터","size":"L"}
</script>
</head><body></body></html>
`

const SELLER_HTML = `
<html><body>
<a href="/product/5pijr/%EC%8A%88%ED%94%84%EB%A6%BC-%EC%A1%B0%EB%8B%A8">item</a>
<a href="/product/9xk2q/%EB%98%90%EB%8B%A4%EB%A5%B8-%EC%83%81%ED%92%88">item</a>
<a href="/product/5pijr/%EC%8A%88%ED%94%84%EB%A6%BC-%EC%A1%B0%EB%8B%A8">duplicate</a>
<a href="/seller/i9za/joongojoah">not a product link</a>
</body></html>
`

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractProductId', () => {
  it('pulls the id segment out of a full URL', () => {
    expect(extractProductId('https://fruitsfamily.com/product/5pijr/name')).toBe('5pijr')
  })

  it('pulls the id segment out of a relative path', () => {
    expect(extractProductId('/product/5pijr/name')).toBe('5pijr')
  })

  it('returns null when there is no product id', () => {
    expect(extractProductId('https://fruitsfamily.com/seller/i9za/joongojoah')).toBe(null)
  })
})

describe('fetchProductFromFruits', () => {
  it('parses the JSON-LD Product block into the expected shape', async () => {
    fetch.mockResolvedValue({
      ok: true,
      type: 'basic',
      status: 200,
      text: async () => PRODUCT_HTML
    })

    const product = await fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')

    expect(product).toEqual({
      name: '슈프림 조던 후드집업',
      price: '120000',
      description: '오버사이즈 핏',
      image_url: 'https://img.fruitsfamily.com/5pijr-1.jpg',
      category: 'Outer',
      size: 'L',
      external_url: 'https://fruitsfamily.com/product/5pijr/name'
    })
  })

  it('rejects a non-fruitsfamily host', async () => {
    await expect(fetchProductFromFruits('https://evil.example.com/product/1')).rejects.toBeInstanceOf(FruitsImportError)
  })

  it('throws when no JSON-LD Product block is present', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => '<html></html>' })
    await expect(fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')).rejects.toBeInstanceOf(FruitsImportError)
  })

  it('throws when the page fetch fails', async () => {
    fetch.mockResolvedValue({ ok: false, type: 'basic', status: 500 })
    await expect(fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')).rejects.toBeInstanceOf(FruitsImportError)
  })
})

describe('listNewFruitsListings', () => {
  it('extracts deduped product listings from the seller page', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => SELLER_HTML })

    const listings = await listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')

    expect(listings).toEqual([
      { id: '5pijr', url: 'https://fruitsfamily.com/product/5pijr/%EC%8A%88%ED%94%84%EB%A6%BC-%EC%A1%B0%EB%8B%A8' },
      { id: '9xk2q', url: 'https://fruitsfamily.com/product/9xk2q/%EB%98%90%EB%8B%A4%EB%A5%B8-%EC%83%81%ED%92%88' }
    ])
  })

  it('returns an empty array when the page has no product links', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => '<html></html>' })
    expect(await listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')).toEqual([])
  })

  it('throws when the seller page fetch fails', async () => {
    fetch.mockResolvedValue({ ok: false, type: 'basic', status: 500 })
    await expect(listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')).rejects.toBeInstanceOf(FruitsImportError)
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/server/fruitsImport.test.js`
Expected: FAIL — `Cannot find module './fruitsImport.js'` (the file doesn't exist yet).

- [ ] **Step 4: Implement `fruitsImport.js`**

Create `src/server/fruitsImport.js`:

```javascript
export const IMPORT_ALLOWED_HOSTS = ['fruitsfamily.com', 'www.fruitsfamily.com']

const CATEGORY_MAP = {
  '아우터': 'Outer',
  '상의': 'Top',
  '하의': 'Bottom',
  '팬츠': 'Bottom',
  '신발': 'Acc',
  '잡화': 'Acc',
  '가방': 'Acc',
  '액세서리': 'Acc'
}

export class FruitsImportError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'FruitsImportError'
    this.status = status
  }
}

function assertAllowedFruitsUrl(urlString) {
  let parsedUrl
  try {
    parsedUrl = new URL(urlString)
  } catch {
    throw new FruitsImportError('올바른 URL이 아닙니다', 400)
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new FruitsImportError('올바른 URL이 아닙니다', 400)
  }
  if (!IMPORT_ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    throw new FruitsImportError('지원하지 않는 사이트입니다 (fruitsfamily.com만 지원)', 400)
  }
  return parsedUrl
}

async function fetchFruitsPage(parsedUrl, notFoundMessage) {
  // redirect: 'manual' so a redirect off fruitsfamily.com (e.g. to an
  // internal address) can't silently bypass the host allowlist above.
  const pageResponse = await fetch(parsedUrl.toString(), {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TokyoCollectiveBot/1.0)' }
  })
  if (pageResponse.type === 'opaqueredirect' || (pageResponse.status >= 300 && pageResponse.status < 400)) {
    throw new FruitsImportError('이 링크는 다른 주소로 리다이렉트되어 처리할 수 없습니다', 502)
  }
  if (!pageResponse.ok) {
    throw new FruitsImportError(notFoundMessage, 502)
  }
  return pageResponse.text()
}

export function extractProductId(urlOrPath) {
  const match = urlOrPath.match(/\/product\/([a-zA-Z0-9]+)(?:\/|$)/)
  return match ? match[1] : null
}

export async function fetchProductFromFruits(urlString) {
  const parsedUrl = assertAllowedFruitsUrl(urlString)
  const html = await fetchFruitsPage(parsedUrl, '상품 페이지를 불러오지 못했습니다')

  const ldJsonBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  let productData = null
  for (const block of ldJsonBlocks) {
    try {
      const parsed = JSON.parse(block[1])
      if (parsed['@type'] === 'Product') {
        productData = parsed
        break
      }
    } catch {
      // skip malformed block
    }
  }

  if (!productData) {
    throw new FruitsImportError('상품 정보를 찾지 못했습니다', 422)
  }

  return {
    name: productData.name || '',
    price: productData.offers?.price ?? '',
    description: productData.description || '',
    image_url: Array.isArray(productData.image) ? productData.image[0] : productData.image || '',
    category: CATEGORY_MAP[productData.category] || 'Top',
    size: productData.size || '',
    external_url: parsedUrl.toString()
  }
}

export async function listNewFruitsListings(sellerUrl) {
  const parsedUrl = assertAllowedFruitsUrl(sellerUrl)
  const html = await fetchFruitsPage(parsedUrl, '셀러 페이지를 불러오지 못했습니다')

  const linkMatches = [...html.matchAll(/href="(\/product\/[a-zA-Z0-9]+\/[^"]*)"/g)]
  const seen = new Set()
  const listings = []
  for (const match of linkMatches) {
    const path = match[1]
    const id = extractProductId(path)
    if (!id || seen.has(id)) continue
    seen.add(id)
    listings.push({ id, url: `https://${parsedUrl.hostname}${path}` })
  }
  return listings
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/server/fruitsImport.test.js`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/server/fruitsImport.js src/server/fruitsImport.test.js
git commit -m "feat: extract FruitsFamily scraping logic into a shared, tested module"
```

---

### Task 2: Refactor the manual import endpoint to use `fruitsImport.js`

**Files:**
- Modify: `src/server/index.js:205-280` (the `IMPORT_ALLOWED_HOSTS`/`CATEGORY_MAP` constants and the `/api/admin/import-product` handler)

**Interfaces:**
- Consumes: `fetchProductFromFruits`, `FruitsImportError` from `./fruitsImport.js` (Task 1).
- Produces: no new interfaces — the endpoint's request/response shape is unchanged, so later tasks don't depend on anything new here.

- [ ] **Step 1: Replace the inline scraping logic with the shared function**

In `src/server/index.js`, delete lines 205-217 (the `IMPORT_ALLOWED_HOSTS` const, the `CATEGORY_MAP` const, and their leading comment) and replace the handler body (lines 219-280) with:

```javascript
app.post('/api/admin/import-product', requireAdmin, async (req, res) => {
  try {
    const { url } = req.body
    const product = await fetchProductFromFruits(url)
    res.json(product)
  } catch (err) {
    if (err instanceof FruitsImportError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error('Product import error:', err)
    res.status(500).json({ error: '상품 정보를 가져오지 못했습니다' })
  }
})
```

Add the import at the top of the file, alongside the existing `import db, { initializeDatabase } from './db.js'` line:

```javascript
import { fetchProductFromFruits, FruitsImportError } from './fruitsImport.js'
```

- [ ] **Step 2: Verify no behavior changed, by hand**

Run: `node src/server/index.js`
Expected console output includes `✅ 빈티지 샵 API 서버 실행 중 → http://localhost:3000`

In a second terminal, log in and re-run the same manual import you'd run before this refactor (replace the token and URL with a real admin token and a real FruitsFamily product URL):

```bash
curl -s -X POST http://localhost:3000/api/admin/login -H "Content-Type: application/json" -d '{"password":"<your admin password>"}'
```

```bash
curl -s -X POST http://localhost:3000/api/admin/import-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token from the login response>" \
  -d '{"url":"https://fruitsfamily.com/product/5pijr/%EC%8A%88%ED%94%84%EB%A6%BC-%EC%A1%B0%EB%8B%A8-%ED%9B%84%EB%93%9C%EC%A7%91%EC%97%85-%EC%83%88%EC%83%81%ED%92%88"}'
```

Expected: the same JSON shape as before the refactor — `{ "name": ..., "price": ..., "description": ..., "image_url": ..., "category": ..., "size": ..., "external_url": ... }`. Also confirm the existing admin dashboard's "후르츠 링크로 가져오기" box still works by pasting a real product URL there.

Also re-run the existing unit tests to make sure nothing regressed:

Run: `npx vitest run`
Expected: PASS (all tests, including Task 1's)

- [ ] **Step 3: Commit**

```bash
git add src/server/index.js
git commit -m "refactor: use shared fruitsImport module for manual product import"
```

---

### Task 3: Add the secret-protected `/api/admin/sync-fruitsfamily` endpoint

**Files:**
- Modify: `src/server/index.js` (add `SYNC_SECRET` startup check, `requireSyncSecret` middleware, `SELLER_URL` constant, and the new route — placed after the existing `/api/admin/import-product` route)
- Modify: `.env` (add a local `SYNC_SECRET` value)

**Interfaces:**
- Consumes: `listNewFruitsListings`, `extractProductId`, `fetchProductFromFruits`, `FruitsImportError` from `./fruitsImport.js` (Task 1); the `all`/`run`/`get` DB helpers already defined in `src/server/index.js`.
- Produces: `POST /api/admin/sync-fruitsfamily` — consumed by Task 4's GitHub Actions workflow. Request: no body, requires header `x-sync-secret: <SYNC_SECRET>`. Response: `200 { imported: Array<{ id: number, name: string, external_url: string }>, skipped: Array<{ url: string, reason: string }> }`, or `401 { error: string }` for a missing/wrong secret, or `502 { error: string }` if the seller page itself can't be loaded.

- [ ] **Step 1: Add a local `SYNC_SECRET`**

Generate a random value and append it to `.env`:

```bash
node -e "console.log('SYNC_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
```

- [ ] **Step 2: Update the import line to pull in the new helpers**

In `src/server/index.js`, change the import added in Task 2 to:

```javascript
import { fetchProductFromFruits, listNewFruitsListings, extractProductId, FruitsImportError } from './fruitsImport.js'
```

- [ ] **Step 3: Add the `SYNC_SECRET` startup check**

Immediately after the existing `ADMIN_PASSWORD` check (near the top of `src/server/index.js`, right after the block that does `process.exit(1)` if `ADMIN_PASSWORD` is missing), add:

```javascript
const SYNC_SECRET = process.env.SYNC_SECRET
if (!SYNC_SECRET) {
  console.error('❌ SYNC_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.')
  process.exit(1)
}
```

- [ ] **Step 4: Add the `requireSyncSecret` middleware**

Immediately after the existing `requireAdmin` function definition, add:

```javascript
function requireSyncSecret(req, res, next) {
  const provided = req.headers['x-sync-secret'] || ''
  const expectedBuf = Buffer.from(SYNC_SECRET)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
```

- [ ] **Step 5: Add the sync endpoint**

Immediately after the `/api/admin/import-product` route (which Task 2 left in place), add:

```javascript
const SELLER_URL = 'https://fruitsfamily.com/seller/i9za/joongojoah'

app.post('/api/admin/sync-fruitsfamily', requireSyncSecret, async (req, res) => {
  try {
    const listings = await listNewFruitsListings(SELLER_URL)

    const existingRows = await all('SELECT external_url FROM products WHERE external_url IS NOT NULL')
    const existingIds = new Set(
      existingRows.map(row => extractProductId(row.external_url)).filter(Boolean)
    )
    const candidates = listings.filter(listing => !existingIds.has(listing.id))

    const imported = []
    const skipped = []

    for (const candidate of candidates) {
      try {
        const product = await fetchProductFromFruits(candidate.url)
        const result = await run(
          `INSERT INTO products (name, price, category, stock, external_url, image_url, description, size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.name,
            Number(product.price) || 0,
            product.category,
            1,
            product.external_url,
            product.image_url || null,
            product.description || null,
            product.size || null
          ]
        )
        imported.push({ id: Number(result.lastInsertRowid), name: product.name, external_url: product.external_url })
      } catch (err) {
        skipped.push({ url: candidate.url, reason: err.message })
      }
    }

    res.json({ imported, skipped })
  } catch (err) {
    if (err instanceof FruitsImportError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error('FruitsFamily sync error:', err)
    res.status(500).json({ error: '동기화에 실패했습니다' })
  }
})
```

- [ ] **Step 6: Verify by hand against the real seller page**

Run: `node src/server/index.js`

In a second terminal, confirm the secret check works:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/sync-fruitsfamily
```
Expected: `401`

```bash
curl -s -X POST http://localhost:3000/api/admin/sync-fruitsfamily -H "x-sync-secret: <the value you generated in Step 1>"
```
Expected: `200` with a JSON body like `{"imported":[...],"skipped":[]}`. Check the response: every listing currently on `https://fruitsfamily.com/seller/i9za/joongojoah` that wasn't already in the products table should now appear in `imported`, and `GET /api/products` should include them.

Run the same curl command again immediately after:
Expected: `{"imported":[],"skipped":[]}` — nothing already-imported gets re-imported (dedup check from the spec's Testing section).

Also re-run the unit tests to confirm Task 1's tests still pass:

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/index.js .env
git commit -m "feat: add secret-protected FruitsFamily auto-sync endpoint"
```

Note: `.env` is expected to already be git-ignored in this project (it holds `ADMIN_PASSWORD` today) — if `git add .env` reports it as ignored, skip it in the commit; it only needs to exist locally so Step 6 can run.

---

### Task 4: Schedule the sync via GitHub Actions and deploy

**Files:**
- Create: `.github/workflows/sync-fruitsfamily.yml`

**Interfaces:**
- Consumes: `POST /api/admin/sync-fruitsfamily` (Task 3), the production `SYNC_SECRET` value.
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Add the production `SYNC_SECRET` to Vercel**

Reuse the same value already generated into local `.env` in Task 3 so behavior is identical between local testing and production:

```bash
grep '^SYNC_SECRET=' .env | cut -d= -f2 | vercel env add SYNC_SECRET production
```

- [ ] **Step 2: Add the same value as a GitHub Actions secret**

```bash
grep '^SYNC_SECRET=' .env | cut -d= -f2 | gh secret set SYNC_SECRET
```

- [ ] **Step 3: Deploy the current branch to production**

```bash
vercel --prod
```

Expected: deployment reports `Ready`/`Production`. Confirm with:

```bash
vercel ls tokyo-collective --prod
```

- [ ] **Step 4: Write the scheduled workflow**

Create `.github/workflows/sync-fruitsfamily.yml`:

```yaml
name: Sync FruitsFamily listings

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call sync endpoint
        run: |
          curl -sf -X POST https://tokyo-collective.vercel.app/api/admin/sync-fruitsfamily \
            -H "x-sync-secret: ${{ secrets.SYNC_SECRET }}"
```

- [ ] **Step 5: Verify the workflow runs**

```bash
git add .github/workflows/sync-fruitsfamily.yml
git commit -m "ci: schedule FruitsFamily auto-sync every 15 minutes"
git push
```

Trigger it manually once rather than waiting up to 15 minutes for the cron:

```bash
gh workflow run sync-fruitsfamily.yml
```

Wait about 30 seconds, then check it succeeded:

```bash
gh run list --workflow=sync-fruitsfamily.yml --limit 1
```

Expected: the latest run shows status `completed` / conclusion `success`. If it fails, run `gh run view --log` on that run's ID to see the curl output/error.
