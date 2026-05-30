import { describe, it, expect } from 'vitest'
import { SCHEMA_TEMPLATES } from '../../src/core/blueprints/schema-templates.generated'
import { SchemaBundleSchema } from '../../src/core/blueprints/import'

interface AnyField {
  name: string
  ui: Record<string, unknown> & { kind: string }
}

function collectReferencedHandles(fields: AnyField[]): string[] {
  const out: string[] = []
  for (const f of fields) {
    const ui = f.ui
    if (ui.kind === 'relationship' && typeof ui.to === 'string') out.push(ui.to)
    if ((ui.kind === 'entry' || ui.kind === 'entries') && Array.isArray(ui.collections)) {
      out.push(...(ui.collections as string[]))
    }
    if (ui.kind === 'link' && Array.isArray(ui.collections)) out.push(...(ui.collections as string[]))
    if (ui.kind === 'grid' && Array.isArray(ui.fields)) {
      out.push(...collectReferencedHandles(ui.fields as AnyField[]))
    }
    if (ui.kind === 'replicator' && Array.isArray(ui.sets)) {
      for (const set of ui.sets as { fields: AnyField[] }[]) {
        out.push(...collectReferencedHandles(set.fields))
      }
    }
  }
  return out
}

describe('built-in schema templates', () => {
  it('ships the expected template keys', () => {
    const keys = SCHEMA_TEMPLATES.map((t) => t.key).sort()
    expect(keys).toEqual([
      'documentation-site',
      'education',
      'health-wellness',
      'podcast',
      'product-portfolio',
      'real-estate',
      'saas-platform',
    ])
  })

  for (const template of SCHEMA_TEMPLATES) {
    describe(`template: ${template.key}`, () => {
      it('is a valid schema bundle', () => {
        const parsed = SchemaBundleSchema.safeParse(template.bundle)
        if (!parsed.success) {
          throw new Error(
            `${template.key} invalid: ` +
              parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          )
        }
        expect(parsed.success).toBe(true)
      })

      it('is self-contained (every referenced collection is defined in the bundle)', () => {
        const bundle = SchemaBundleSchema.parse(template.bundle)
        const handles = new Set(bundle.blueprints.map((b) => b.handle))
        for (const bp of bundle.blueprints) {
          for (const ref of collectReferencedHandles(bp.fields as unknown as AnyField[])) {
            expect(handles.has(ref), `${bp.handle} references missing collection '${ref}'`).toBe(true)
          }
        }
      })

      it('metadata matches the bundle handles', () => {
        const bundle = SchemaBundleSchema.parse(template.bundle)
        expect(template.handles).toEqual(bundle.blueprints.map((b) => b.handle))
      })
    })
  }
})

describe('SchemaBundleSchema', () => {
  it('rejects a bundle with no blueprints', () => {
    expect(SchemaBundleSchema.safeParse({ version: 1, blueprints: [] }).success).toBe(false)
  })

  it('rejects an unknown version', () => {
    expect(
      SchemaBundleSchema.safeParse({ version: 2, blueprints: [{ handle: 'x', label: 'X', singleton: false, fields: [{ name: 'a', ui: { kind: 'text' }, optional: true }] }] }).success,
    ).toBe(false)
  })

  it('rejects an invalid handle', () => {
    const bad = {
      version: 1,
      blueprints: [{ handle: 'Bad Handle', label: 'X', singleton: false, fields: [{ name: 'a', ui: { kind: 'text' }, optional: true }] }],
    }
    expect(SchemaBundleSchema.safeParse(bad).success).toBe(false)
  })
})
