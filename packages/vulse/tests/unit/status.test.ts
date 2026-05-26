import { describe, it, expect } from 'vitest'
import { getVulseStatus } from '../../src/server/status'
import type { RuntimeEnv } from '../../src/server/env'
import { PLACEHOLDER_AUTH_SECRET } from '../../src/placeholder-auth-secret'

function baseEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return {
    DB: {} as RuntimeEnv['DB'],
    BETTER_AUTH_SECRET: 'a-real-secret-value-1234567890-abcdef',
    ...overrides,
  } as RuntimeEnv
}

describe('getVulseStatus', () => {
  it('reports development + local SQLite when isDev is true', () => {
    const s = getVulseStatus(baseEnv(), true)
    expect(s.mode).toBe('development')
    expect(s.database).toBe('local SQLite')
  })

  it('reports production + remote D1 when isDev is false', () => {
    const s = getVulseStatus(baseEnv(), false)
    expect(s.mode).toBe('production')
    expect(s.database).toBe('remote D1')
  })

  it('includes the Vulse version', () => {
    const s = getVulseStatus(baseEnv(), true)
    expect(typeof s.version).toBe('string')
    expect(s.version.length).toBeGreaterThan(0)
  })

  it('detects the db binding as present and others absent by default', () => {
    const s = getVulseStatus(baseEnv(), true)
    expect(s.bindings).toEqual({ db: true, bucket: false, queue: false, images: false })
  })

  it('detects bucket and queue bindings when present', () => {
    const s = getVulseStatus(
      baseEnv({ BUCKET: {} as RuntimeEnv['BUCKET'], FORM_QUEUE: {} as RuntimeEnv['FORM_QUEUE'] }),
      true,
    )
    expect(s.bindings.bucket).toBe(true)
    expect(s.bindings.queue).toBe(true)
  })

  it('requires BOTH image vars for the images binding', () => {
    expect(getVulseStatus(baseEnv({ CF_IMAGES_ACCOUNT_HASH: 'h' }), true).bindings.images).toBe(false)
    expect(getVulseStatus(baseEnv({ CF_IMAGES_TOKEN: 't' }), true).bindings.images).toBe(false)
    expect(
      getVulseStatus(baseEnv({ CF_IMAGES_ACCOUNT_HASH: 'h', CF_IMAGES_TOKEN: 't' }), true).bindings.images,
    ).toBe(true)
  })

  it('warns about the placeholder auth secret', () => {
    const s = getVulseStatus(baseEnv({ BETTER_AUTH_SECRET: PLACEHOLDER_AUTH_SECRET }), true)
    expect(s.warnings.some((w) => /placeholder/i.test(w))).toBe(true)
  })

  it('warns about sign-up enabled in production only', () => {
    const prod = getVulseStatus(baseEnv({ VULSE_ALLOW_MEMBER_SIGNUP: 'true' }), false)
    expect(prod.warnings.some((w) => /sign-up/i.test(w))).toBe(true)

    const dev = getVulseStatus(baseEnv({ VULSE_ALLOW_MEMBER_SIGNUP: 'true' }), true)
    expect(dev.warnings.some((w) => /sign-up/i.test(w))).toBe(false)
  })

  it('has no warnings for a healthy production env', () => {
    const s = getVulseStatus(baseEnv(), false)
    expect(s.warnings).toEqual([])
  })
})
