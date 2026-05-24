import { describe, expect, it } from 'vitest'

import { compileBlueprintSchema } from '../../src/core/blueprints/compile.js'
import type { BlueprintDefinition } from '../../src/core/blueprints/definition.js'
import {
  formatSelectOptionsText,
  normalizeSelectOptions,
  parseSelectOptionsText,
  selectOptionKeys,
} from '../../src/core/blueprints/select-helpers.js'
import { fieldDescriptorsFromDefinitions } from '../../src/core/blueprints/reflect-fields.js'
import { parseContent } from '../../src/core/parse-content.js'
import { entry, entries, grid, link, z } from '../../src/core/blueprints/zod-helpers.js'
import { reflectFields } from '../../src/core/blueprints/reflect-fields.js'

describe('select-helpers', () => {
  it('parses key: label lines', () => {
    expect(parseSelectOptionsText('face\nknow: I know')).toEqual([
      'face',
      { key: 'know', label: 'I know' },
    ])
  })

  it('normalizes string options to key/label pairs', () => {
    expect(normalizeSelectOptions(['a', { key: 'b', label: 'Bee' }])).toEqual([
      { key: 'a', label: 'a' },
      { key: 'b', label: 'Bee' },
    ])
  })

  it('round-trips through formatSelectOptionsText', () => {
    const options = ['plain', { key: 'k', label: 'Label' }]
    expect(parseSelectOptionsText(formatSelectOptionsText(options))).toEqual(options)
  })

  it('extracts enum keys', () => {
    expect(selectOptionKeys(['a', { key: 'b', label: 'B' }])).toEqual(['a', 'b'])
  })
})

describe('compileBlueprintSchema — new field types', () => {
  const def: BlueprintDefinition = {
    handle: 'page',
    label: 'Page',
    singleton: false,
    fields: [
      {
        name: 'category',
        ui: {
          kind: 'select',
          options: [{ key: 'news', label: 'News' }, 'blog'],
          multiple: true,
          clearable: true,
        },
        optional: false,
      },
      {
        name: 'featured',
        ui: { kind: 'entry', collections: ['post'] },
        optional: true,
      },
      {
        name: 'related',
        ui: { kind: 'entries', collections: ['post', 'page'], max: 3 },
        optional: false,
      },
      {
        name: 'cta',
        ui: { kind: 'link', collections: ['page'] },
        optional: true,
      },
      {
        name: 'cast',
        ui: {
          kind: 'grid',
          fields: [
            { name: 'actor', ui: { kind: 'text' }, optional: false },
            { name: 'role', ui: { kind: 'text' }, optional: false },
          ],
          minRows: 1,
          maxRows: 10,
          mode: 'table',
        },
        optional: false,
      },
    ],
  }

  it('compiles and validates content', () => {
    const schema = compileBlueprintSchema(def)
    const parsed = parseContent(schema, {
      category: ['news', 'blog'],
      related: ['id-1', 'id-2'],
      cast: [{ actor: 'Mark', role: 'Luke' }],
      cta: { type: 'url', url: 'https://example.com' },
    })
    expect(parsed.category).toEqual(['news', 'blog'])
    expect(parsed.cast).toHaveLength(1)
    expect(parsed.cta).toEqual({ type: 'url', url: 'https://example.com' })
  })

  it('produces field descriptors for admin UI', () => {
    const fields = fieldDescriptorsFromDefinitions(def.fields)
    expect(fields.map((f) => f.widget)).toEqual(['enum', 'entry', 'entries', 'link', 'grid'])
    expect(fields[0].selectMultiple).toBe(true)
    expect(fields[4].itemFields?.map((f) => f.path)).toEqual(['actor', 'role'])
  })
})

describe('zod helpers — reflectFields', () => {
  it('detects entry, entries, link, and grid widgets', () => {
    const schema = z.object({
      hero: link(['page']),
      author: entry('post'),
      related: entries(['post'], 2),
      cast: grid({ actor: z.string(), character: z.string() }, { minRows: 1 }),
    })
    const fields = reflectFields(schema)
    expect(fields.find((f) => f.path === 'hero')?.widget).toBe('link')
    expect(fields.find((f) => f.path === 'author')?.widget).toBe('entry')
    expect(fields.find((f) => f.path === 'related')?.widget).toBe('entries')
    expect(fields.find((f) => f.path === 'cast')?.widget).toBe('grid')
  })
})
