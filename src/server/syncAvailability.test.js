import { describe, it, expect, vi } from 'vitest'
import { syncSoldOutStatus } from './syncAvailability.js'

const FF = 'https://fruitsfamily.com/product'

function makeDeps({ rows, fetchProduct, markSoldOut } = {}) {
  return {
    listInStock: vi.fn(async () => rows),
    fetchProduct: fetchProduct ?? vi.fn(async () => ({ available: true })),
    markSoldOut: markSoldOut ?? vi.fn(async () => {})
  }
}

describe('syncSoldOutStatus', () => {
  it('marks a product sold out when FruitsFamily reports it unavailable', async () => {
    const deps = makeDeps({
      rows: [{ id: 1, name: '후드집업', external_url: `${FF}/aaa/x` }],
      fetchProduct: vi.fn(async () => ({ available: false }))
    })

    const result = await syncSoldOutStatus(deps)

    expect(deps.markSoldOut).toHaveBeenCalledWith(1)
    expect(result.soldOut).toEqual([{ id: 1, name: '후드집업' }])
    expect(result.skipped).toEqual([])
  })

  it('leaves products alone while FruitsFamily still reports them available', async () => {
    const deps = makeDeps({
      rows: [{ id: 1, name: 'A', external_url: `${FF}/aaa/x` }]
    })

    const result = await syncSoldOutStatus(deps)

    expect(deps.markSoldOut).not.toHaveBeenCalled()
    expect(result.soldOut).toEqual([])
  })

  it('never marks a product sold out when the page check fails', async () => {
    const deps = makeDeps({
      rows: [{ id: 1, name: 'A', external_url: `${FF}/aaa/x` }],
      fetchProduct: vi.fn(async () => {
        throw new Error('timeout')
      })
    })

    const result = await syncSoldOutStatus(deps)

    expect(deps.markSoldOut).not.toHaveBeenCalled()
    expect(result.soldOut).toEqual([])
    expect(result.skipped).toEqual([
      { id: 1, url: `${FF}/aaa/x`, reason: 'timeout' }
    ])
  })

  it('keeps going after one product fails and still marks the others', async () => {
    const fetchProduct = vi.fn(async url => {
      if (url.includes('bad')) throw new Error('boom')
      return { available: false }
    })
    const deps = makeDeps({
      rows: [
        { id: 1, name: 'A', external_url: `${FF}/bad/x` },
        { id: 2, name: 'B', external_url: `${FF}/ok/x` }
      ],
      fetchProduct
    })

    const result = await syncSoldOutStatus(deps)

    expect(result.soldOut).toEqual([{ id: 2, name: 'B' }])
    expect(result.skipped).toHaveLength(1)
  })

  it('reports a failed database update as skipped, not as sold out', async () => {
    const deps = makeDeps({
      rows: [{ id: 1, name: 'A', external_url: `${FF}/aaa/x` }],
      fetchProduct: vi.fn(async () => ({ available: false })),
      markSoldOut: vi.fn(async () => {
        throw new Error('db down')
      })
    })

    const result = await syncSoldOutStatus(deps)

    expect(result.soldOut).toEqual([])
    expect(result.skipped[0].reason).toBe('db down')
  })

  it('ignores products whose link is not a FruitsFamily URL', async () => {
    const deps = makeDeps({
      rows: [
        { id: 1, name: 'A', external_url: 'https://example.com/product/1' },
        { id: 2, name: 'B', external_url: 'not a url' },
        { id: 3, name: 'C', external_url: `${FF}/ccc/x` }
      ]
    })

    await syncSoldOutStatus(deps)

    expect(deps.fetchProduct).toHaveBeenCalledTimes(1)
    expect(deps.fetchProduct).toHaveBeenCalledWith(`${FF}/ccc/x`)
  })

  it('checks at most maxChecks products and reports how many were left', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      external_url: `${FF}/id${i}/x`
    }))
    const deps = makeDeps({ rows })

    const result = await syncSoldOutStatus({ ...deps, maxChecks: 3 })

    expect(deps.fetchProduct).toHaveBeenCalledTimes(3)
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
      return { available: true }
    })
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      external_url: `${FF}/id${i}/x`
    }))
    const deps = makeDeps({ rows, fetchProduct })

    await syncSoldOutStatus({ ...deps, concurrency: 4 })

    expect(fetchProduct).toHaveBeenCalledTimes(12)
    expect(peak).toBeLessThanOrEqual(4)
  })
})
