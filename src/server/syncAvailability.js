import { IMPORT_ALLOWED_HOSTS } from './fruitsImport.js'

const DEFAULT_CONCURRENCY = 5
// Bounds one run's outbound requests so it stays inside the serverless
// function's time limit (~0.25s per page at concurrency 5, measured against the
// live site). Anything beyond it is reported as `unchecked`.
const DEFAULT_MAX_CHECKS = 30

function isFruitsFamilyUrl(urlString) {
  try {
    return IMPORT_ALLOWED_HOSTS.includes(new URL(urlString).hostname)
  } catch {
    return false
  }
}

// Looks up each in-stock product's FruitsFamily page and sells it out here too
// once FruitsFamily reports it unavailable. One-way on purpose: it never
// restocks, so an admin who zeroed a product's stock by hand isn't overridden.
// A failed page check never marks anything sold out - only a successful read
// that says "unavailable" does.
//
// Dependencies are injected so this can be tested without a database or network:
//   listInStock() -> [{ id, name, external_url }]
//   fetchProduct(url) -> { available: boolean }, throws on failure
//   markSoldOut(id) -> sets that product's stock to 0
export async function syncSoldOutStatus({
  listInStock,
  fetchProduct,
  markSoldOut,
  concurrency = DEFAULT_CONCURRENCY,
  maxChecks = DEFAULT_MAX_CHECKS
}) {
  const rows = (await listInStock()).filter(row => isFruitsFamilyUrl(row.external_url))
  const toCheck = rows.slice(0, maxChecks)
  const unchecked = rows.length - toCheck.length

  const soldOut = []
  const skipped = []

  async function checkOne(row) {
    try {
      const product = await fetchProduct(row.external_url)
      if (product.available === false) {
        await markSoldOut(row.id)
        soldOut.push({ id: row.id, name: row.name })
      }
    } catch (err) {
      skipped.push({ id: row.id, url: row.external_url, reason: err.message })
    }
  }

  // A small worker pool: each worker pulls the next row until none are left.
  let next = 0
  async function worker() {
    while (next < toCheck.length) {
      await checkOne(toCheck[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toCheck.length) }, worker))

  return { soldOut, skipped, unchecked }
}
