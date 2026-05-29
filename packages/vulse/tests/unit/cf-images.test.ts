import { describe, it, expect } from 'vitest'
import { buildDeliveryUrl, buildImageUrl, buildImageSrcset, isImagesEnabled, publicMediaPath } from '../../src/server/cf-images'

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

describe('publicMediaPath', () => {
  it('points at the unauthenticated public media route', () => {
    expect(publicMediaPath('abc')).toBe('/api/vulse/public/media/abc/file')
  })
})

describe('buildImageUrl', () => {
  it('returns the plain public path when nothing is configured', () => {
    expect(buildImageUrl({}, 'img1')).toBe('/api/vulse/public/media/img1/file')
  })

  it('wraps the public path in a /cdn-cgi/image transform with format=auto when enabled', () => {
    const url = buildImageUrl({ transform: true }, 'img1', { width: 800, quality: 70 })
    expect(url).toBe('/cdn-cgi/image/format=auto,quality=70,fit=scale-down,width=800/api/vulse/public/media/img1/file')
  })

  it('maps a named variant to a width on the transform path', () => {
    const url = buildImageUrl({ transform: true }, 'img1', { variant: 'hero' })
    expect(url).toContain('format=auto')
    expect(url).toContain('width=1600')
    expect(url).toContain('/api/vulse/public/media/img1/file')
  })

  it('prefers Cloudflare Images storage URLs when an account hash is set', () => {
    expect(buildImageUrl({ accountHash: 'abc' }, 'img1', { variant: 'hero' }))
      .toBe('https://imagedelivery.net/abc/img1/hero')
  })
})

describe('buildImageSrcset', () => {
  it('returns null when transforms are disabled', () => {
    expect(buildImageSrcset({}, 'img1', [400, 800])).toBeNull()
  })

  it('builds a width-descriptor srcset when transforms are enabled', () => {
    const srcset = buildImageSrcset({ transform: true }, 'img1', [400, 800])
    expect(srcset).toBe(
      '/cdn-cgi/image/format=auto,quality=82,fit=scale-down,width=400/api/vulse/public/media/img1/file 400w, ' +
      '/cdn-cgi/image/format=auto,quality=82,fit=scale-down,width=800/api/vulse/public/media/img1/file 800w',
    )
  })
})
