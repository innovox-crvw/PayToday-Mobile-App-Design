import { describe, expect, it } from 'vitest'
import {
  parseCatalogImageUrl,
  parseEmailString,
  parseNonNegativeInt,
  parseOptionalCatalogImageUrl,
  parseOptionalCompareAtPriceCents,
  parseProductSlug,
  parseSku,
} from '../backend/src/lib/inputValidators.js'

describe('inputValidators', () => {
  it('parseEmailString normalizes and validates', () => {
    expect(parseEmailString('  User@Example.COM ', 'email')).toEqual({
      ok: true,
      value: 'user@example.com',
    })
    expect(parseEmailString('bad', 'email').ok).toBe(false)
  })

  it('parseProductSlug enforces lowercase hyphen rules', () => {
    expect(parseProductSlug('good-slug-1', 'slug')).toEqual({ ok: true, value: 'good-slug-1' })
    expect(parseProductSlug('bad slug', 'slug').ok).toBe(false)
    expect(parseProductSlug('-bad', 'slug').ok).toBe(false)
    expect(parseProductSlug('bad--x', 'slug').ok).toBe(false)
  })

  it('parseSku rejects empty and control characters', () => {
    expect(parseSku('SKU-1.a', 'sku').ok).toBe(true)
    expect(parseSku('', 'sku').ok).toBe(false)
    expect(parseSku('x\ny', 'sku').ok).toBe(false)
  })

  it('parseOptionalCatalogImageUrl allows https or upload path only', () => {
    expect(
      parseOptionalCatalogImageUrl('https://cdn.example.com/p.jpg', 'u'),
    ).toEqual({ ok: true, value: 'https://cdn.example.com/p.jpg' })
    expect(
      parseOptionalCatalogImageUrl('/api/uploads/products/181bcee6-b14b-4416-b50b-c81cb602e950.jpg', 'u'),
    ).toEqual({
      ok: true,
      value: '/api/uploads/products/181bcee6-b14b-4416-b50b-c81cb602e950.jpg',
    })
    expect(parseOptionalCatalogImageUrl('http://insecure.com/x.png', 'u').ok).toBe(false)
    expect(parseOptionalCatalogImageUrl('data:text/html,hi', 'u').ok).toBe(false)
  })

  it('parseCatalogImageUrl rejects empty', () => {
    expect(parseCatalogImageUrl('', 'url').ok).toBe(false)
  })

  it('parseNonNegativeInt bounds', () => {
    expect(parseNonNegativeInt(0, 'n')).toEqual({ ok: true, value: 0 })
    expect(parseNonNegativeInt('-1', 'n').ok).toBe(false)
  })

  it('parseOptionalCompareAtPriceCents', () => {
    expect(parseOptionalCompareAtPriceCents(null, 100, 'c')).toEqual({ ok: true, value: null })
    expect(parseOptionalCompareAtPriceCents(200, 100, 'c')).toEqual({ ok: true, value: 200 })
    expect(parseOptionalCompareAtPriceCents(50, 100, 'c').ok).toBe(false)
  })
})
