import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveActiveLocale } from '../../src/admin/client/active-locale'

describe('resolveActiveLocale', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses entryLocale as fallback during SSR', () => {
    expect(resolveActiveLocale(['en', 'nb-NO'], 'nb-NO', 'en')).toBe('nb-NO')
  })

  it('prefers the URL locale on the client when supported', () => {
    vi.stubGlobal('location', { search: '?locale=nb-NO' })
    expect(resolveActiveLocale(['en', 'nb-NO'], 'en', 'en')).toBe('nb-NO')
  })

  it('falls back when the URL locale is unsupported', () => {
    vi.stubGlobal('location', { search: '?locale=fr' })
    expect(resolveActiveLocale(['en', 'nb-NO'], 'nb-NO', 'en')).toBe('nb-NO')
  })

  it('falls back to defaultLocale when URL has no locale param', () => {
    vi.stubGlobal('location', { search: '' })
    expect(resolveActiveLocale(['en', 'nb-NO'], undefined, 'en')).toBe('en')
  })
})
