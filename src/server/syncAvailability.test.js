import { describe, it, expect, vi } from 'vitest'
import { syncAvailability } from './syncAvailability.js'

const FF = 'https://fruitsfamily.com/product'

function makeDeps({ rows, fetchProduct, markSoldOut, markInStock, deleteProduct } = {}) {
  return {
    listLinked: vi.fn(async () => rows),
    fetchProduct: fetchProduct ?? vi.fn(async () => ({ available: true, availabilityKnown: true })),
    markSoldOut: markSoldOut ?? vi.fn(async () => {}),
    markInStock: markInStock ?? vi.fn(async () => {}),
    deleteProduct: deleteProduct ?? vi.fn(async () => {})
  }
}

// What fetchProductFromFruits throws: `gone: true` when the listing no longer
// exists on FruitsFamily (404/410, or a page with no product data), `gone: false`
// for any other failure (500, timeout, ...).
function fetchError(gone, message = 'page failed') {
  return Object.assign(new Error(message), { gone })
}

const inStock = (id, extra = {}) => ({ id, name: `P${id}`, external_url: `${FF}/id${id}/x`, inStock: true, ...extra })
const soldOut = (id, extra = {}) => ({ id, name: `P${id}`, external_url: `${FF}/id${id}/x`, inStock: false, ...extra })

describe('syncAvailability: selling out', () => {
  it('marks an in-stock product sold out when FruitsFamily reports it unavailable', async () => {
    const deps = makeDeps({
      rows: [inStock(1, { name: '후드집업' })],
      fetchProduct: vi.fn(async () => ({ available: false, availabilityKnown: true }))
    })

    const result = await syncAvailability(deps)

    expect(deps.markSoldOut).toHaveBeenCalledWith(1)
    expect(deps.markInStock).not.toHaveBeenCalled()
    expect(result.soldOut).toEqual([{ id: 1, name: '후드집업' }])
    expect(result.restocked).toEqual([])
  })

  it('leaves an in-stock product alone while FruitsFamily still reports it available', async () => {
    const deps = makeDeps({ rows: [inStock(1)] })

    const result = await syncAvailability(deps)

    expect(deps.markSoldOut).not.toHaveBeenCalled()
    expect(deps.markInStock).not.toHaveBeenCalled()
    expect(result.soldOut).toEqual([])
    expect(result.restocked).toEqual([])
  })
})

describe('syncAvailability: restocking', () => {
  it('restocks a sold-out product once FruitsFamily explicitly reports it in stock', async () => {
    const deps = makeDeps({
      rows: [soldOut(1, { name: '후드집업' })],
      fetchProduct: vi.fn(async () => ({ available: true, availabilityKnown: true }))
    })

    const result = await syncAvailability(deps)

    expect(deps.markInStock).toHaveBeenCalledWith(1)
    expect(deps.markSoldOut).not.toHaveBeenCalled()
    expect(result.restocked).toEqual([{ id: 1, name: '후드집업' }])
    expect(result.soldOut).toEqual([])
  })

  it('does NOT restock when the availability field is absent (unknown is not proof of stock)', async () => {
    const deps = makeDeps({
      rows: [soldOut(1)],
      fetchProduct: vi.fn(async () => ({ available: true, availabilityKnown: false }))
    })

    const result = await syncAvailability(deps)

    expect(deps.markInStock).not.toHaveBeenCalled()
    expect(result.restocked).toEqual([])
  })

  it('leaves a sold-out product alone while FruitsFamily still reports it unavailable', async () => {
    const deps = makeDeps({
      rows: [soldOut(1)],
      fetchProduct: vi.fn(async () => ({ available: false, availabilityKnown: true }))
    })

    const result = await syncAvailability(deps)

    expect(deps.markInStock).not.toHaveBeenCalled()
    expect(deps.markSoldOut).not.toHaveBeenCalled()
    expect(result.restocked).toEqual([])
  })
})

describe('syncAvailability: failures', () => {
  it('never changes a product when the page check fails', async () => {
    const deps = makeDeps({
      rows: [inStock(1), soldOut(2)],
      fetchProduct: vi.fn(async () => {
        throw new Error('timeout')
      })
    })

    const result = await syncAvailability(deps)

    expect(deps.markSoldOut).not.toHaveBeenCalled()
    expect(deps.markInStock).not.toHaveBeenCalled()
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped[0].reason).toBe('timeout')
  })

  it('keeps going after one product fails and still updates the others', async () => {
    const fetchProduct = vi.fn(async url => {
      if (url.includes('id1')) throw new Error('boom')
      return { available: false, availabilityKnown: true }
    })
    const deps = makeDeps({ rows: [inStock(1), inStock(2)], fetchProduct })

    const result = await syncAvailability(deps)

    expect(result.soldOut).toEqual([{ id: 2, name: 'P2' }])
    expect(result.skipped).toHaveLength(1)
  })

  it('reports a failed database update as skipped, not as changed', async () => {
    const deps = makeDeps({
      rows: [inStock(1), soldOut(2)],
      fetchProduct: vi.fn(async url =>
        url.includes('id1')
          ? { available: false, availabilityKnown: true }
          : { available: true, availabilityKnown: true }
      ),
      markSoldOut: vi.fn(async () => {
        throw new Error('db down')
      }),
      markInStock: vi.fn(async () => {
        throw new Error('db down')
      })
    })

    const result = await syncAvailability(deps)

    expect(result.soldOut).toEqual([])
    expect(result.restocked).toEqual([])
    expect(result.skipped.map(s => s.reason)).toEqual(['db down', 'db down'])
  })
})

describe('syncAvailability: scope and limits', () => {
  it('ignores products whose link is not a FruitsFamily URL', async () => {
    const deps = makeDeps({
      rows: [
        { id: 1, name: 'A', external_url: 'https://example.com/product/1', inStock: true },
        { id: 2, name: 'B', external_url: 'not a url', inStock: false },
        inStock(3)
      ]
    })

    await syncAvailability(deps)

    expect(deps.fetchProduct).toHaveBeenCalledTimes(1)
    expect(deps.fetchProduct).toHaveBeenCalledWith(`${FF}/id3/x`)
  })

  it('checks in-stock products before sold-out ones when it has to cut off at maxChecks', async () => {
    const rows = [soldOut(1), soldOut(2), inStock(3), inStock(4)]
    const deps = makeDeps({ rows })

    const result = await syncAvailability({ ...deps, maxChecks: 2 })

    const checked = deps.fetchProduct.mock.calls.map(([url]) => url).sort()
    expect(checked).toEqual([`${FF}/id3/x`, `${FF}/id4/x`])
    expect(result.unchecked).toBe(2)
  })

  it('never has more than `concurrency` page checks in flight at once', async () => {
    let inFlight = 0
    let peak = 0
    const fetchProduct = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight--
      return { available: true, availabilityKnown: true }
    })
    const rows = Array.from({ length: 12 }, (_, i) => inStock(i + 1))
    const deps = makeDeps({ rows, fetchProduct })

    await syncAvailability({ ...deps, concurrency: 4 })

    expect(fetchProduct).toHaveBeenCalledTimes(12)
    expect(peak).toBeLessThanOrEqual(4)
  })
})

describe('syncAvailability: deleting removed listings', () => {
  // A listing counts as removed only when BOTH signals agree: its page is gone
  // (404/410) AND it no longer appears on the seller page. Sold items stay on
  // the seller page, so being absent from it is a strong "deleted" signal.
  const gone = vi.fn(async () => {
    throw fetchError(true)
  })

  it('deletes a product whose page is 404 and that is no longer on the seller page', async () => {
    const deps = makeDeps({ rows: [inStock(1, { name: '삭제된 상품' })], fetchProduct: gone })

    const result = await syncAvailability({ ...deps, listedIds: new Set(['id2']) })

    expect(deps.deleteProduct).toHaveBeenCalledWith(1)
    expect(result.deleted).toEqual([{ id: 1, name: '삭제된 상품' }])
    expect(result.skipped).toEqual([])
  })

  it('also deletes a sold-out product that was removed', async () => {
    const deps = makeDeps({ rows: [soldOut(1)], fetchProduct: gone })

    const result = await syncAvailability({ ...deps, listedIds: new Set() })

    expect(deps.deleteProduct).toHaveBeenCalledWith(1)
    expect(result.deleted).toHaveLength(1)
  })

  it('keeps a product whose page is 404 but that is still on the seller page', async () => {
    const deps = makeDeps({ rows: [inStock(1)], fetchProduct: gone })

    const result = await syncAvailability({ ...deps, listedIds: new Set(['id1']) })

    expect(deps.deleteProduct).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
    expect(result.skipped).toHaveLength(1)
  })

  it('keeps a product that is missing from the seller page but whose page still loads', async () => {
    const deps = makeDeps({ rows: [inStock(1)] })

    const result = await syncAvailability({ ...deps, listedIds: new Set(['id2']) })

    expect(deps.deleteProduct).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
  })

  it('never deletes when the seller page could not be read (no listedIds)', async () => {
    const deps = makeDeps({ rows: [inStock(1)], fetchProduct: gone })

    const result = await syncAvailability(deps)

    expect(deps.deleteProduct).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
    expect(result.skipped).toHaveLength(1)
  })

  it('never deletes on a failure that is not "gone" (timeout, 500), even if unlisted', async () => {
    const deps = makeDeps({
      rows: [inStock(1), inStock(2)],
      fetchProduct: vi.fn(async url => {
        throw url.includes('id1') ? fetchError(false) : new Error('timeout')
      })
    })

    const result = await syncAvailability({ ...deps, listedIds: new Set() })

    expect(deps.deleteProduct).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
    expect(result.skipped).toHaveLength(2)
  })

  it('refuses to delete anything when more than maxDeletes look removed at once', async () => {
    const rows = [inStock(1), inStock(2), inStock(3), inStock(4)]
    const deps = makeDeps({ rows, fetchProduct: gone })

    const result = await syncAvailability({ ...deps, listedIds: new Set(), maxDeletes: 3 })

    expect(deps.deleteProduct).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
    expect(result.deleteSuppressed.map(p => p.id)).toEqual([1, 2, 3, 4])
  })

  it('deletes when the number of removed listings is exactly maxDeletes', async () => {
    const rows = [inStock(1), inStock(2), inStock(3)]
    const deps = makeDeps({ rows, fetchProduct: gone })

    const result = await syncAvailability({ ...deps, listedIds: new Set(), maxDeletes: 3 })

    expect(deps.deleteProduct).toHaveBeenCalledTimes(3)
    expect(result.deleted).toHaveLength(3)
    expect(result.deleteSuppressed).toEqual([])
  })

  it('reports a failed database delete as skipped, not as deleted', async () => {
    const deps = makeDeps({
      rows: [inStock(1)],
      fetchProduct: gone,
      deleteProduct: vi.fn(async () => {
        throw new Error('db down')
      })
    })

    const result = await syncAvailability({ ...deps, listedIds: new Set() })

    expect(result.deleted).toEqual([])
    expect(result.skipped[0].reason).toBe('db down')
  })

  it('does not treat a link without a product id as deletable', async () => {
    const deps = makeDeps({
      rows: [{ id: 1, name: 'A', external_url: 'https://fruitsfamily.com/seller/i9za', inStock: true }],
      fetchProduct: gone
    })

    const result = await syncAvailability({ ...deps, listedIds: new Set() })

    expect(deps.deleteProduct).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
  })
})
