import { describe, it, expect, vi } from 'vitest'
import { syncAvailability } from './syncAvailability.js'

const FF = 'https://fruitsfamily.com/product'

function makeDeps({ rows, fetchProduct, markSoldOut, markInStock } = {}) {
  return {
    listLinked: vi.fn(async () => rows),
    fetchProduct: fetchProduct ?? vi.fn(async () => ({ available: true, availabilityKnown: true })),
    markSoldOut: markSoldOut ?? vi.fn(async () => {}),
    markInStock: markInStock ?? vi.fn(async () => {})
  }
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
