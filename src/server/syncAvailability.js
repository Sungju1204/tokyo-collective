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

// Mirrors FruitsFamily's availability onto the products we already have:
//   in stock here  + unavailable there            -> sell it out here
//   sold out here  + explicitly in stock there    -> restock it here
// The shop has no checkout of its own (the buy button opens the FruitsFamily
// listing), so FruitsFamily is the single source of truth for stock.
//
// Two safety rules:
//  - A failed page check changes nothing; only a successful read counts.
//  - Restocking needs FruitsFamily to *say* the item is in stock. A page whose
//    availability field is missing (markup drift) reads as "available" for new
//    listings, but must never bring sold-out products back.
//
// In-stock products are checked first, so if the per-run cap cuts anything off
// it is the sold-out ones (which change least often).
//
// Dependencies are injected so this can be tested without a database or network:
//   listLinked() -> [{ id, name, external_url, inStock }], in a stable order
//   fetchProduct(url) -> { available, availabilityKnown }, throws on failure
//   markSoldOut(id), markInStock(id)
export async function syncAvailability({
  listLinked,
  fetchProduct,
  markSoldOut,
  markInStock,
  concurrency = DEFAULT_CONCURRENCY,
  maxChecks = DEFAULT_MAX_CHECKS
}) {
  const rows = (await listLinked())
    .filter(row => isFruitsFamilyUrl(row.external_url))
    // Array.prototype.sort is stable, so the caller's order holds within each group.
    .sort((a, b) => Number(b.inStock) - Number(a.inStock))
  const toCheck = rows.slice(0, maxChecks)
  const unchecked = rows.length - toCheck.length

  const soldOut = []
  const restocked = []
  const skipped = []

  async function checkOne(row) {
    try {
      const product = await fetchProduct(row.external_url)
      if (row.inStock && product.available === false) {
        await markSoldOut(row.id)
        soldOut.push({ id: row.id, name: row.name })
      } else if (!row.inStock && product.available === true && product.availabilityKnown === true) {
        await markInStock(row.id)
        restocked.push({ id: row.id, name: row.name })
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

  return { soldOut, restocked, skipped, unchecked }
}
