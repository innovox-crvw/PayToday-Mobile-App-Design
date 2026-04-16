import { describe, expect, it } from 'vitest'
import { parseInventoryAdjustmentCsv } from '../backend/src/services/inventoryCsvImport.js'

describe('parseInventoryAdjustmentCsv', () => {
  it('parses header + rows with reasons', () => {
    const csv = `sku,qty_delta,reason
A-1,2,restock
B-2,-1,damaged`
    const { rows, parseErrors, firstDataLine } = parseInventoryAdjustmentCsv(csv)
    expect(parseErrors).toHaveLength(0)
    expect(firstDataLine).toBe(2)
    expect(rows).toEqual([
      { sku: 'A-1', qtyDelta: 2, reason: 'restock' },
      { sku: 'B-2', qtyDelta: -1, reason: 'damaged' },
    ])
  })

  it('requires reason when header present', () => {
    const csv = `sku,qty_delta,reason
X,1,`
    const { rows, parseErrors } = parseInventoryAdjustmentCsv(csv)
    expect(rows).toHaveLength(0)
    expect(parseErrors.some((e) => e.message.includes('reason'))).toBe(true)
  })

  it('without header uses default reason and starts at line 1', () => {
    const csv = `SKU1,5
SKU2,-2`
    const { rows, parseErrors, firstDataLine } = parseInventoryAdjustmentCsv(csv)
    expect(parseErrors).toHaveLength(0)
    expect(firstDataLine).toBe(1)
    expect(rows).toEqual([
      { sku: 'SKU1', qtyDelta: 5, reason: 'csv_import' },
      { sku: 'SKU2', qtyDelta: -2, reason: 'csv_import' },
    ])
  })

  it('rejects invalid qty_delta', () => {
    const csv = `sku,qty_delta,reason
A,abc,count`
    const { parseErrors } = parseInventoryAdjustmentCsv(csv)
    expect(parseErrors.length).toBeGreaterThan(0)
  })
})
