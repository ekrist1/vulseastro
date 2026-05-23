import { describe, it, expect } from 'vitest'
import { probeDimensions } from '../../src/server/image-probe'

describe('probeDimensions', () => {
  it('reads PNG dimensions from header', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZjYJ6cAAAAASUVORK5CYII=', 'base64')
    const buf = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
    expect(probeDimensions(buf, 'image/png')).toEqual({ width: 1, height: 1 })
  })

  it('returns null for non-image mime', () => {
    expect(probeDimensions(new Uint8Array([0]).buffer, 'application/pdf')).toBeNull()
  })
})
