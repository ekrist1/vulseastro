import { describe, it, expect } from 'vitest'
import { resolvePreviewRoot } from '../../src/client/preview-root'

// The live-preview bridge morphs a root element. Default selector is <main>, but
// fresh/scaffolded pages often have no <main> — it must fall back to <body> so live
// updates still apply (otherwise morphdom is a no-op and only a full reload updates).
describe('resolvePreviewRoot', () => {
  const main = { id: 'main' } as unknown as Element
  const body = { id: 'body' } as unknown as Element

  it('returns the element matching the configured selector', () => {
    const scope = { querySelector: (s: string) => (s === 'main' ? main : null), body }
    expect(resolvePreviewRoot(scope, 'main')).toBe(main)
  })

  it('falls back to <body> when the selector matches nothing', () => {
    const scope = { querySelector: () => null, body }
    expect(resolvePreviewRoot(scope, 'main')).toBe(body)
  })

  it('honours a custom selector when present', () => {
    const custom = { id: 'app' } as unknown as Element
    const scope = { querySelector: (s: string) => (s === '#app' ? custom : null), body }
    expect(resolvePreviewRoot(scope, '#app')).toBe(custom)
  })

  it('returns null when neither the selector nor body exists', () => {
    const scope = { querySelector: () => null, body: null }
    expect(resolvePreviewRoot(scope, 'main')).toBeNull()
  })
})
