import { describe, expect, it } from 'vitest'
import { inferPackageDimensions } from '../src/lib/productPackageProfiles.js'
import { generateProductTabContent, isStubProductDescription } from '../src/lib/productTabContentTemplates.js'

describe('productPackageProfiles', () => {
  it('infers TV-sized carton for 43 inch TV', () => {
    const d = inferPackageDimensions('LED TV 43 inch', 'electronics')
    expect(d.packageLengthMm).toBeGreaterThan(900)
    expect(d.grossWeightG).toBeGreaterThan(8000)
  })

  it('infers wine bottle dimensions', () => {
    const d = inferPackageDimensions('Cabernet Sauvignon 750ml', 'wine')
    expect(d.packageHeightMm).toBeGreaterThan(300)
    expect(d.grossWeightG).toBeGreaterThan(1000)
  })
})

describe('productTabContentTemplates', () => {
  it('detects short catalog stub descriptions', () => {
    expect(isStubProductDescription('Pantry staple: Spar full cream milk 2L.', 'Spar full cream milk 2L')).toBe(true)
  })

  it('whats in the box lists product, sku, and dimensions', () => {
    const dims = inferPackageDimensions('LED TV 43 inch', 'electronics')
    const tabs = generateProductTabContent({
      name: 'LED TV 43 inch',
      description: null,
      categorySlug: 'electronics',
      categoryName: 'Electronics',
      brandName: null,
      sku: 'ELC-TV-43',
      variantLines: [{ sku: 'ELC-TV-43', name: 'Standard' }],
      packageDims: dims,
    })
    expect(tabs.whatsInTheBox).toContain('Contents of this shipment')
    expect(tabs.whatsInTheBox).toContain('ELC-TV-43')
    expect(tabs.whatsInTheBox).toContain('LED TV 43 inch')
    expect(tabs.whatsInTheBox).toContain(`${dims.packageLengthMm}`)
    expect(tabs.description.length).toBeGreaterThan(100)
  })
})
