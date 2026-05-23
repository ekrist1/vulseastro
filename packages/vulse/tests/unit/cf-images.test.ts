import { describe, it, expect } from 'vitest'
import { buildDeliveryUrl, isImagesEnabled } from '../../src/server/cf-images'

describe('cf-images', () => {
  it('returns null when not configured', () => {
    expect(buildDeliveryUrl({}, 'x')).toBeNull()
    expect(isImagesEnabled({})).toBe(false)
  })

  it('builds delivery URL with default variant', () => {
    expect(buildDeliveryUrl({ accountHash: 'abc' }, 'img1')).toBe('https://imagedelivery.net/abc/img1/card')
  })

  it('accepts custom variant', () => {
    expect(buildDeliveryUrl({ accountHash: 'abc' }, 'img1', 'hero')).toBe('https://imagedelivery.net/abc/img1/hero')
  })
})
