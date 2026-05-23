import { describe, it, expect } from 'vitest'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { blocks, media, ref } from '../../src/core/blueprints/zod-helpers'

describe('defineCollection', () => {
  it('returns the blueprint unchanged when valid', () => {
    const bp = defineCollection({
      name: 'post', label: 'Post',
      schema: z.object({ title: z.string() }),
      admin: { titleField: 'title' },
    })
    expect(bp.name).toBe('post')
  })

  it('rejects bad names', () => {
    expect(() => defineCollection({
      name: 'BadName', label: '', schema: z.object({}), admin: { titleField: '' },
    })).toThrow(/lowercase/)
  })
})

describe('zod helpers', () => {
  it('blocks() defaults to []', () => {
    expect(blocks().parse(undefined)).toEqual([])
  })
  it('media() carries the vulse:media tag', () => {
    expect(media().description).toBe('vulse:media')
  })
  it('ref() carries the target', () => {
    expect(ref('user').description).toBe('vulse:ref:user')
  })

  it('z.media() works via proxy', () => {
    expect(z.media().description).toBe('vulse:media')
  })
})
