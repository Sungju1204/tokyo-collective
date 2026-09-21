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

const SOLD_OUT_PRODUCT_HTML = `
<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"품절 상품","offers":{"price":"50000","availability":"https://schema.org/SoldOut"},"category":"상의"}
</script>
</head><body></body></html>
`

const IN_STOCK_PRODUCT_HTML = `
<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"재고 있는 상품","offers":{"price":"50000","availability":"https://schema.org/InStock"},"category":"상의"}
</script>
</head><body></body></html>
`

const OUT_OF_STOCK_PRODUCT_HTML = `
<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"재고 없는 상품","offers":{"price":"50000","availability":"http://schema.org/OutOfStock"},"category":"상의"}
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

const SELLER_HTML_MIXED_HREF_STYLES = `
<html><body>
<a href='/product/5pijr/single-quoted'>item</a>
<a href="https://fruitsfamily.com/product/9xk2q/absolute">item</a>
<a href="https://www.fruitsfamily.com/product/abc12/absolute-www">item</a>
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
      available: true,
      availabilityKnown: false,
      external_url: 'https://fruitsfamily.com/product/5pijr/name'
    })
  })

  it('reports available: false when availability says sold out', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => SOLD_OUT_PRODUCT_HTML })

    const product = await fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')

    expect(product.available).toBe(false)
    expect(product.availabilityKnown).toBe(true)
  })

  it('reports available: false when availability says out of stock', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => OUT_OF_STOCK_PRODUCT_HTML })

    const product = await fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')

    expect(product.available).toBe(false)
  })

  it('reports available: true when availability says in stock', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => IN_STOCK_PRODUCT_HTML })

    const product = await fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')

    expect(product.available).toBe(true)
    expect(product.availabilityKnown).toBe(true)
  })

  it('defaults to available: true when the availability field is absent', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => PRODUCT_HTML })

    const product = await fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')

    expect(product.available).toBe(true)
    // absent means "unknown", so callers must not treat it as proof of stock
    expect(product.availabilityKnown).toBe(false)
  })

  it('passes an abort signal so a hung connection cannot stall the run', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => PRODUCT_HTML })

    await fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')

    expect(fetch).toHaveBeenCalledWith(
      'https://fruitsfamily.com/product/5pijr/name',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
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

  // `gone` tells callers a listing no longer exists on FruitsFamily, as opposed
  // to one that merely failed to load right now.
  it.each([404, 410])('flags a %i response as gone, keeping our own status 502', async status => {
    fetch.mockResolvedValue({ ok: false, type: 'basic', status })
    await expect(fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')).rejects.toMatchObject({
      name: 'FruitsImportError',
      status: 502,
      upstreamStatus: status,
      gone: true
    })
  })

  it.each([500, 503, 429])('does not flag a %i response as gone', async status => {
    fetch.mockResolvedValue({ ok: false, type: 'basic', status })
    await expect(fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')).rejects.toMatchObject({
      status: 502,
      upstreamStatus: status,
      gone: false
    })
  })

  // FruitsFamily answers 200 with a page that has no product data for a
  // product id that does not exist (a "soft 404"), so a removed listing can look
  // like this rather than like a 404.
  it('flags a 200 page with no product data as gone', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => '<html></html>' })
    await expect(fetchProductFromFruits('https://fruitsfamily.com/product/5pijr/name')).rejects.toMatchObject({
      status: 422,
      gone: true
    })
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

  it('matches single-quoted and absolute hrefs too', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => SELLER_HTML_MIXED_HREF_STYLES })

    const listings = await listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')

    expect(listings).toEqual([
      { id: '5pijr', url: 'https://fruitsfamily.com/product/5pijr/single-quoted' },
      { id: '9xk2q', url: 'https://fruitsfamily.com/product/9xk2q/absolute' },
      { id: 'abc12', url: 'https://fruitsfamily.com/product/abc12/absolute-www' }
    ])
  })

  it('throws a 502 rather than succeeding silently when no product links match', async () => {
    fetch.mockResolvedValue({ ok: true, type: 'basic', status: 200, text: async () => '<html></html>' })

    await expect(listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')).rejects.toMatchObject({
      name: 'FruitsImportError',
      status: 502,
      message: '셀러 페이지에서 상품 링크를 찾지 못했습니다'
    })
    await expect(
      listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')
    ).rejects.toBeInstanceOf(FruitsImportError)
  })

  it('throws when the seller page fetch fails', async () => {
    fetch.mockResolvedValue({ ok: false, type: 'basic', status: 500 })
    await expect(listNewFruitsListings('https://fruitsfamily.com/seller/i9za/joongojoah')).rejects.toBeInstanceOf(FruitsImportError)
  })
})
