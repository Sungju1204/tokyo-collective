import { IMPORT_ALLOWED_HOSTS, extractProductId } from './fruitsImport.js'

const DEFAULT_CONCURRENCY = 5
// Bounds one run's outbound requests so it stays inside the serverless
// function's time limit (~0.25s per page at concurrency 5, measured against the
// live site). Anything beyond it is reported as `unchecked`.
const DEFAULT_MAX_CHECKS = 30
// More removals than this in one run looks like a fault (a half-loaded seller
// page, an outage), not a seller clearing their shelf, so nothing is deleted.
const DEFAULT_MAX_DELETES = 3

function isFruitsFamilyUrl(urlString) {
  try {
    return IMPORT_ALLOWED_HOSTS.includes(new URL(urlString).hostname)
  } catch {
    return false
  }
}

// fetchProductFromFruits marks an error `gone` when the listing no longer exists
// there (404/410, or a 200 page with no product data).
const isGone = err => err.gone === true

// The name/price differences to write for one product, or null when there is
// nothing worth writing. FruitsFamily's values are used only when they look
// real, so a page-format change cannot blank a name or zero a price.
function detailChange(row, product) {
  const values = {}
  const changes = {}

  const name = typeof product.name === 'string' ? product.name.trim() : ''
  if (name && name !== row.name) {
    values.name = name
    changes.name = { from: row.name, to: name }
  }

  // The page reports price as a string ("120000"); prices here are whole won.
  const price = Math.round(Number(product.price))
  if (Number.isFinite(price) && price > 0 && price !== Number(row.price)) {
    values.price = price
    changes.price = { from: row.price, to: price }
  }

  return Object.keys(values).length > 0 ? { values, changes } : null
}

// Mirrors FruitsFamily onto the products we already have:
//   in stock here  + unavailable there            -> sell it out here
//   sold out here  + explicitly in stock there    -> restock it here
//   listing removed there                         -> delete it here
//   name or price changed there                   -> update it here
// The shop has no checkout of its own (the buy button opens the FruitsFamily
// listing), so FruitsFamily is the single source of truth.
//
// Safety rules:
//  - A failed page check changes nothing; only a successful read counts.
//  - Restocking needs FruitsFamily to *say* the item is in stock. A page whose
//    availability field is missing (markup drift) reads as "available" for new
//    listings, but must never bring sold-out products back.
//  - Deleting needs two independent signals: the product page is gone (404/410,
//    or a page with no product data) AND the product is no longer on the seller
//    page. Sold items stay on the seller page, so absence from it means the
//    listing was really removed. With no `listedIds` (seller page unreadable)
//    nothing is ever deleted, and more than `maxDeletes` removals in one run are
//    all held back and reported.
//  - Name and price are copied only when they look real: a non-empty name and a
//    positive whole-number price. Anything else is ignored, so a page-format
//    change cannot blank a name or zero a price.
//
// In-stock products are checked first, so if the per-run cap cuts anything off
// it is the sold-out ones (which change least often).
//
// Dependencies are injected so this can be tested without a database or network:
//   listLinked() -> [{ id, name, price, external_url, inStock }], in a stable order
//   fetchProduct(url) -> { available, availabilityKnown, name, price }; throws on
//     failure, with `err.gone` set when the listing no longer exists there
//   markSoldOut(id), markInStock(id), deleteProduct(id)
//   updateDetails(id, { name?, price? }) writes only the changed, valid fields
//   listedIds: Set of product ids currently on the seller page, or undefined
export async function syncAvailability({
  listLinked,
  fetchProduct,
  markSoldOut,
  markInStock,
  deleteProduct,
  updateDetails,
  listedIds,
  concurrency = DEFAULT_CONCURRENCY,
  maxChecks = DEFAULT_MAX_CHECKS,
  maxDeletes = DEFAULT_MAX_DELETES
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
  const removed = []
  const updated = []

  // Each change to a product is its own step, so one failing (say a database
  // error on the name update) never blocks or undoes another.
  async function attempt(row, step) {
    try {
      await step()
    } catch (err) {
      skipped.push({ id: row.id, url: row.external_url, reason: err.message })
    }
  }

  async function checkOne(row) {
    let product
    try {
      product = await fetchProduct(row.external_url)
    } catch (err) {
      const productId = extractProductId(row.external_url)
      if (listedIds && isGone(err) && productId && !listedIds.has(productId)) {
        removed.push({ id: row.id, name: row.name })
      } else {
        skipped.push({ id: row.id, url: row.external_url, reason: err.message })
      }
      return
    }

    await attempt(row, async () => {
      if (row.inStock && product.available === false) {
        await markSoldOut(row.id)
        soldOut.push({ id: row.id, name: row.name })
      } else if (!row.inStock && product.available === true && product.availabilityKnown === true) {
        await markInStock(row.id)
        restocked.push({ id: row.id, name: row.name })
      }
    })

    await attempt(row, async () => {
      const change = detailChange(row, product)
      if (!change) return
      await updateDetails(row.id, change.values)
      updated.push({ id: row.id, name: change.values.name ?? row.name, changes: change.changes })
    })
  }

  // A small worker pool: each worker pulls the next row until none are left.
  let next = 0
  async function worker() {
    while (next < toCheck.length) {
      await checkOne(toCheck[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toCheck.length) }, worker))

  // Workers finish in any order; sort so the result is deterministic.
  removed.sort((a, b) => a.id - b.id)
  const deleted = []
  const deleteSuppressed = []
  if (removed.length > maxDeletes) {
    deleteSuppressed.push(...removed)
  } else {
    for (const product of removed) {
      try {
        await deleteProduct(product.id)
        deleted.push(product)
      } catch (err) {
        skipped.push({ id: product.id, reason: err.message })
      }
    }
  }

  return { soldOut, restocked, deleted, deleteSuppressed, updated, skipped, unchecked }
}
