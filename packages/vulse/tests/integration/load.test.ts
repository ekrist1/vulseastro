import { describe, it, expect, afterEach } from 'vitest'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { _resetRegistry, _seedRegistry, registryFromUserCollections } from '../../src/core/blueprints/load'

describe('registryFromUserCollections', () => {
  afterEach(() => _resetRegistry())

  it('loads seeded blueprints in tests', async () => {
    const bp = defineCollection({
      name: 'page', label: 'Page', schema: z.object({ title: z.string() }),
      admin: { titleField: 'title' },
    })
    _seedRegistry([bp])
    const reg = await registryFromUserCollections()
    expect(reg.get('page')).toBe(bp)
  })
})
