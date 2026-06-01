import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { reflectFields } from '../../src/admin/client/form-from-zod.js'

describe('reflectFields', () => {
  it('returns one descriptor per shape entry', () => {
    const fields = reflectFields(z.object({ title: z.string(), n: z.number(), b: z.boolean() }))
    expect(fields.map((f) => f.path)).toEqual(['title', 'n', 'b'])
    expect(fields.map((f) => f.widget)).toEqual(['text', 'number', 'bool'])
  })

  it('detects enum', () => {
    const fields = reflectFields(z.object({ status: z.enum(['draft', 'published']) }))
    expect(fields[0].widget).toBe('enum')
    expect(fields[0].options).toEqual(['draft', 'published'])
  })

  it('detects date', () => {
    const fields = reflectFields(z.object({ at: z.date() }))
    expect(fields[0].widget).toBe('date')
  })

  it('detects media via .describe(vulse:media)', () => {
    const fields = reflectFields(z.object({ img: z.string().describe('vulse:media') }))
    expect(fields[0].widget).toBe('media')
  })

  it('detects ref via .describe(vulse:ref:user)', () => {
    const fields = reflectFields(z.object({ author: z.string().describe('vulse:ref:user') }))
    expect(fields[0].widget).toBe('ref')
    expect(fields[0].refTarget).toBe('user')
  })

  it('uses textarea for long strings', () => {
    const fields = reflectFields(z.object({ body: z.string().max(2000) }))
    expect(fields[0].widget).toBe('textarea')
  })

  it('supports nested objects (recursive)', () => {
    const fields = reflectFields(z.object({ meta: z.object({ slug: z.string() }) }))
    expect(fields[0].widget).toBe('object')
    expect(fields[0].children?.[0].path).toBe('slug')
  })

  it('supports repeaters', () => {
    const fields = reflectFields(z.object({ items: z.array(z.object({ label: z.string() })) }))
    expect(fields[0].widget).toBe('repeater')
    expect(fields[0].itemFields?.[0].path).toBe('label')
  })
})
