import { describe, it, expect } from 'vitest'
import { GlobalSetDefinitionSchema } from '../../src/core/globals/definition'

const siteGlobal = {
  handle: 'site',
  label: 'Site',
  fields: [
    { name: 'siteName', label: 'Site name', ui: { kind: 'text' as const }, optional: false },
    { name: 'tagline', ui: { kind: 'textarea' as const }, optional: true },
  ],
}

describe('GlobalSetDefinitionSchema', () => {
  it('parses a valid global set', () => {
    const parsed = GlobalSetDefinitionSchema.parse(siteGlobal)
    expect(parsed.handle).toBe('site')
    expect(parsed.fields).toHaveLength(2)
  })

  it('allows global sets with no fields', () => {
    const parsed = GlobalSetDefinitionSchema.parse({ ...siteGlobal, fields: [] })
    expect(parsed.fields).toEqual([])
  })

  it('rejects invalid handles', () => {
    expect(() => GlobalSetDefinitionSchema.parse({ ...siteGlobal, handle: 'Site' })).toThrow()
  })
})
