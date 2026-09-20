export const IMPORT_ALLOWED_HOSTS = ['fruitsfamily.com', 'www.fruitsfamily.com']

// Per-request timeout for outbound calls to fruitsfamily.com.
const FETCH_TIMEOUT_MS = 10_000

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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TokyoCollectiveBot/1.0)' },
    // Bound each outbound request so a hung connection to fruitsfamily.com
    // can't stall the whole sync run until the platform kills it.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
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

  // schema.org availability is usually a URL like https://schema.org/InStock or
  // https://schema.org/SoldOut. Treat an absent field as available, since most
  // listings don't carry it and absence shouldn't block a sale.
  const availability = String(productData.offers?.availability || '').toLowerCase()
  const available = !availability.includes('soldout') && !availability.includes('outofstock')

  return {
    name: productData.name || '',
    price: productData.offers?.price ?? '',
    description: productData.description || '',
    image_url: Array.isArray(productData.image) ? productData.image[0] : productData.image || '',
    category: CATEGORY_MAP[productData.category] || 'Top',
    size: productData.size || '',
    available,
    external_url: parsedUrl.toString()
  }
}

export async function listNewFruitsListings(sellerUrl) {
  const parsedUrl = assertAllowedFruitsUrl(sellerUrl)
  const html = await fetchFruitsPage(parsedUrl, '셀러 페이지를 불러오지 못했습니다')

  // Accept single- or double-quoted hrefs, relative or absolute, so a small
  // markup change doesn't silently produce zero matches.
  const linkMatches = [
    ...html.matchAll(/href=["'](?:https?:\/\/(?:www\.)?fruitsfamily\.com)?(\/product\/[a-zA-Z0-9]+\/[^"']*)["']/g)
  ]
  if (linkMatches.length === 0) {
    // Zero matches means the markup drifted (or the page failed to render its
    // grid) far more often than it means the seller has no listings at all.
    // Per the spec, that's a 502 rather than a silent successful no-op.
    throw new FruitsImportError('셀러 페이지에서 상품 링크를 찾지 못했습니다', 502)
  }

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
