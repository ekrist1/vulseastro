import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createBlueprint, listBlueprintDefinitions } from '../../src/core/blueprints/mutations'
import { importBlueprints, type SchemaBundle } from '../../src/core/blueprints/import'
import { SCHEMA_TEMPLATES } from '../../src/core/blueprints/schema-templates.generated'
import { SchemaBundleSchema } from '../../src/core/blueprints/import'

describe('importBlueprints', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('imports a built-in template and skips on re-run', async () => {
    const db = createDb(env.DB)
    const template = SCHEMA_TEMPLATES.find((t) => t.key === 'documentation-site')!
    const bundle = SchemaBundleSchema.parse(template.bundle)

    const first = await importBlueprints(db, bundle)
    expect(first.created).toEqual(
      expect.arrayContaining(['author', 'documentation_section', 'documentation_page']),
    )
    expect(first.skipped).toEqual([])
    expect(first.failed).toEqual([])

    const handles = (await listBlueprintDefinitions(db)).map((b) => b.handle)
    expect(handles).toEqual(expect.arrayContaining(['author', 'documentation_section', 'documentation_page']))

    const second = await importBlueprints(db, bundle)
    expect(second.created).toEqual([])
    expect(second.skipped.sort()).toEqual(['author', 'documentation_page', 'documentation_section'])
  })

  it('orders by relationship dependency regardless of author order', async () => {
    const db = createDb(env.DB)
    // The page references the section/author but is listed FIRST in the bundle.
    const bundle: SchemaBundle = {
      version: 1,
      blueprints: [
        {
          handle: 'doc_page',
          label: 'Doc page',
          singleton: false,
          fields: [
            { name: 'title', ui: { kind: 'text' }, optional: false },
            { name: 'section', ui: { kind: 'relationship', to: 'doc_section' }, optional: true },
          ],
        },
        {
          handle: 'doc_section',
          label: 'Doc section',
          singleton: false,
          fields: [{ name: 'title', ui: { kind: 'text' }, optional: false }],
        },
      ],
    }

    const result = await importBlueprints(db, bundle)
    expect(result.failed).toEqual([])
    expect(result.created).toEqual(['doc_section', 'doc_page'])
  })

  it('skips a handle that already exists and imports the rest', async () => {
    const db = createDb(env.DB)
    await createBlueprint(db, {
      handle: 'agent',
      label: 'Existing agent',
      singleton: false,
      fields: [{ name: 'name', ui: { kind: 'text' }, optional: false }],
    })

    const bundle: SchemaBundle = {
      version: 1,
      blueprints: [
        { handle: 'agent', label: 'Agent', singleton: false, fields: [{ name: 'name', ui: { kind: 'text' }, optional: false }] },
        { handle: 'office', label: 'Office', singleton: false, fields: [{ name: 'name', ui: { kind: 'text' }, optional: false }] },
      ],
    }

    const result = await importBlueprints(db, bundle)
    expect(result.skipped).toEqual(['agent'])
    expect(result.created).toEqual(['office'])
  })

  it('reports a relationship target that resolves nowhere as failed', async () => {
    const db = createDb(env.DB)
    const bundle: SchemaBundle = {
      version: 1,
      blueprints: [
        {
          handle: 'review',
          label: 'Review',
          singleton: false,
          fields: [{ name: 'book', ui: { kind: 'relationship', to: 'missing_book' }, optional: true }],
        },
      ],
    }

    const result = await importBlueprints(db, bundle)
    expect(result.created).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.handle).toBe('review')
  })
})
