import { describe, expect, it } from 'vitest'
import { buildFlickrTags, detectPrimaryProductTag, flickrLockSeed } from '../src/lib/productSplashImage.js'

describe('productSplashImage', () => {
  it('detects soundbar', () => {
    expect(detectPrimaryProductTag('Alpine Soundbar Pro', 'alpine-soundbar-hh-el-4246')).toBe('soundbar')
  })

  it('detects speaker vs television', () => {
    expect(detectPrimaryProductTag('Mini Bluetooth speaker', 'bluetooth-speaker-mini')).toContain('speaker')
    expect(detectPrimaryProductTag('Samsung Television', 'samsung-television-hh-el-1714')).toBe('television')
  })

  it('detects kitchen appliances', () => {
    expect(detectPrimaryProductTag('Electric kettle 1.7 L', 'electric-kettle')).toBe('electric,kettle')
    expect(detectPrimaryProductTag('KIC Fridge', 'kic-fridge-hh-ki-8579')).toBe('refrigerator')
  })

  it('detects furniture', () => {
    expect(detectPrimaryProductTag('House Brand Sofa', 'house-brand-sofa-hh-li-9708')).toBe('sofa')
  })

  it('uses unique lock per product id', () => {
    expect(flickrLockSeed('a')).not.toBe(flickrLockSeed('b'))
  })

  it('buildFlickrTags prioritizes product type over brand', () => {
    const tags = buildFlickrTags({
      name: 'Alpine Soundbar Pro',
      categorySlug: 'electronics',
      productSlug: 'alpine-soundbar-pro',
    })
    expect(tags.startsWith('soundbar')).toBe(true)
    expect(tags).not.toContain('alpine')
  })
})
