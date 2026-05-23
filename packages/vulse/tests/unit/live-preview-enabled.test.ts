import { describe, it, expect } from 'vitest'
import { isLivePreviewEnabled } from '../../src/admin/client/live-preview-enabled.js'

describe('isLivePreviewEnabled', () => {
  it('defaults to enabled', () => {
    expect(isLivePreviewEnabled(undefined)).toBe(true)
    expect(isLivePreviewEnabled(true)).toBe(true)
  })

  it('treats boolean and string false as disabled', () => {
    expect(isLivePreviewEnabled(false)).toBe(false)
    expect(isLivePreviewEnabled('false')).toBe(false)
  })
})
