import { describe, it, expect, beforeEach } from 'vitest'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'

describe('BlueprintRegistry', () => {
  let reg: BlueprintRegistry
  beforeEach(() => { reg = new BlueprintRegistry() })

  it('registers and retrieves by name', () => {
    const bp = defineCollection({ name: 'post', label: 'Post', schema: z.object({}), admin: { titleField: 't' } })
    reg.register(bp)
    expect(reg.get('post')).toBe(bp)
  })

  it('throws on duplicate name', () => {
    const bp1 = defineCollection({ name: 'post', label: 'A', schema: z.object({}), admin: { titleField: 't' } })
    const bp2 = defineCollection({ name: 'post', label: 'B', schema: z.object({}), admin: { titleField: 't' } })
    reg.register(bp1)
    expect(() => reg.register(bp2)).toThrow(/already registered/)
  })

  it('lists all names', () => {
    reg.register(defineCollection({ name: 'a', label: '', schema: z.object({}), admin: { titleField: 't' } }))
    reg.register(defineCollection({ name: 'b', label: '', schema: z.object({}), admin: { titleField: 't' } }))
    expect(reg.list().map((b) => b.name).sort()).toEqual(['a', 'b'])
  })

  it('returns undefined for unknown name', () => {
    expect(reg.get('missing')).toBeUndefined()
  })
})
