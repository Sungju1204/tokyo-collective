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
