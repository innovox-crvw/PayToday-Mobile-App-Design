import { describe, expect, it } from 'vitest'
import {
  compareAtCentsFromPercentOff,
  SUPER_DEAL_DISCOUNT_PERCENT_BY_SKU,
  superDealCompareAtForSku,
} from '../src/lib/superDealDiscounts.js'

describe('superDealDiscounts', () => {
  it('maps at least 20 SKUs for the home rail', () => {
    expect(Object.keys(SUPER_DEAL_DISCOUNT_PERCENT_BY_SKU).length).toBeGreaterThanOrEqual(20)
  })

  it('compare-at is strictly above sale price', () => {
    const cmp = superDealCompareAtForSku('ELC-PHN-64', 359900)
    expect(cmp).not.toBeNull()
    expect(cmp!).toBeGreaterThan(359900)
    const pct = Math.round(((cmp! - 359900) / cmp!) * 100)
    expect(pct).toBe(12)
  })

  it('returns null for SKUs not in the deal map', () => {
    expect(superDealCompareAtForSku('GRO-BRD-700', 1999)).toBeNull()
  })

  it('compareAtCentsFromPercentOff rejects invalid percent', () => {
    expect(compareAtCentsFromPercentOff(1000, 0)).toBeNull()
    expect(compareAtCentsFromPercentOff(1000, 99)).toBeNull()
  })
})
