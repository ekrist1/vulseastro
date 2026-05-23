import { describe, it, expect } from 'vitest'
import { VULSE_VERSION } from '../../src/index'

describe('package smoke test', () => {
  it('exposes a version string', () => {
    expect(VULSE_VERSION).toBe('0.0.0')
  })
})
