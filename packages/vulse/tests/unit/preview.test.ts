import { describe, it, expect } from 'vitest'
import { mintPreviewToken, verifyPreviewToken } from '../../src/server/preview'

describe('preview token', () => {
  it('round-trips', async () => {
    const t = await mintPreviewToken('a'.repeat(32), 'u1')
    expect(await verifyPreviewToken('a'.repeat(32), t)).toBe(true)
  })

  it('rejects wrong secret', async () => {
    const t = await mintPreviewToken('a'.repeat(32), 'u1')
    expect(await verifyPreviewToken('b'.repeat(32), t)).toBe(false)
  })
})
