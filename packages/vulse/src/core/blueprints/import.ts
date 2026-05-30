import { z } from 'astro/zod'
import type { VulseDb } from '../db.js'
import {
  BlueprintDefinitionSchema,
  type BlueprintDefinition,
  type FieldDefinition,
  type NestedFieldDefinition,
} from './definition.js'
import { createBlueprint, listBlueprintDefinitions } from './mutations.js'

/**
 * A portable bundle of collection blueprints. One bundle is typically one
 * "industry" (e.g. a documentation site) and is self-contained: any collection
 * referenced by a `relationship` field is included in the same bundle.
 */
export const SchemaBundleSchema = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  description: z.string().optional(),
  blueprints: z.array(BlueprintDefinitionSchema).min(1),
})

export type SchemaBundle = z.infer<typeof SchemaBundleSchema>

export type ImportConflictStrategy = 'skip'

export interface ImportResult {
  created: string[]
  skipped: string[]
  failed: { handle: string; error: string }[]
}

/**
 * Collect the handles referenced by `relationship` fields (recursing through
 * grid/replicator nested fields). Only relationship targets must already exist
 * when a blueprint is created — entry/entries/link collections are not checked
 * at create time — so these are the only edges that constrain import order.
 */
function collectRelationshipTargets(
  fields: Array<FieldDefinition | NestedFieldDefinition>,
): Set<string> {
  const out = new Set<string>()
  for (const f of fields) {
    const ui = f.ui
    if (ui.kind === 'relationship' && 'to' in ui) {
      out.add(ui.to)
    } else if (ui.kind === 'grid' && 'fields' in ui) {
      for (const t of collectRelationshipTargets(ui.fields)) out.add(t)
    } else if (ui.kind === 'replicator' && 'sets' in ui) {
      for (const set of ui.sets) {
        for (const t of collectRelationshipTargets(set.fields)) out.add(t)
      }
    }
  }
  return out
}

/**
 * Depth-first topological order so a blueprint is created after the in-bundle
 * collections it references. Cycles are tolerated (the offending blueprint is
 * emitted anyway and will surface as a `failed` entry if its target is missing).
 */
function orderByDependencies(blueprints: BlueprintDefinition[]): BlueprintDefinition[] {
  const byHandle = new Map(blueprints.map((b) => [b.handle, b]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const ordered: BlueprintDefinition[] = []

  function visit(bp: BlueprintDefinition): void {
    if (visited.has(bp.handle) || visiting.has(bp.handle)) return
    visiting.add(bp.handle)
    for (const dep of collectRelationshipTargets(bp.fields)) {
      const target = byHandle.get(dep)
      if (target && dep !== bp.handle) visit(target)
    }
    visiting.delete(bp.handle)
    visited.add(bp.handle)
    ordered.push(bp)
  }

  for (const bp of blueprints) visit(bp)
  return ordered
}

/**
 * Import a bundle of blueprints into the database. Existing handles are skipped
 * (the import is additive and safe to re-run). Per-blueprint failures (e.g. a
 * relationship target that exists neither in the DB nor the bundle) are reported
 * without aborting the rest of the import.
 *
 * Callers that run inside the request runtime should `_resetRegistry()` +
 * `invalidateRuntime()` afterwards so the new collections become visible.
 */
export async function importBlueprints(
  db: VulseDb,
  bundle: SchemaBundle,
  opts: { onConflict?: ImportConflictStrategy } = {},
): Promise<ImportResult> {
  void (opts.onConflict ?? 'skip')
  const existing = new Set((await listBlueprintDefinitions(db)).map((b) => b.handle))
  const ordered = orderByDependencies(bundle.blueprints)
  const result: ImportResult = { created: [], skipped: [], failed: [] }

  for (const bp of ordered) {
    if (existing.has(bp.handle)) {
      result.skipped.push(bp.handle)
      continue
    }
    try {
      await createBlueprint(db, bp)
      result.created.push(bp.handle)
      existing.add(bp.handle)
    } catch (err) {
      result.failed.push({ handle: bp.handle, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}
