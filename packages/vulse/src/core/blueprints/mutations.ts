import { asc, eq, sql } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulseCollections } from '../schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { hashDefinition } from './compile.js'
import {
  type BlueprintDefinition,
  BlueprintDefinitionSchema,
  type BlueprintDefinitionWithRenames,
  BlueprintDefinitionWithRenamesSchema,
  type FieldDefinitionWithRename,
  type FieldUi,
  type NestedFieldDefinition,
} from './definition.js'

export async function createBlueprint(
  db: VulseDb,
  input: BlueprintDefinition,
): Promise<BlueprintDefinition> {
  const def = await validateNew(db, input)
  const now = Date.now()
  await db.insert(vulseCollections).values({
    handle: def.handle,
    label: def.label,
    definition: def,
    blueprintHash: hashDefinition(def),
    singleton: def.singleton,
    tree: def.tree === true,
    drafts: def.drafts === true,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
  return def
}

export async function updateBlueprint(
  db: VulseDb,
  handle: string,
  input: BlueprintDefinitionWithRenames,
): Promise<BlueprintDefinition> {
  const existing = await loadDefinition(db, handle)
  if (!existing) throw new NotFoundError(`blueprint not found: ${handle}`)

  const incoming = { ...input, handle }
  const parsed = parseOrThrow(BlueprintDefinitionWithRenamesSchema, incoming)

  const oldNames = new Set(existing.fields.map((f) => f.name))
  for (const f of parsed.fields) {
    if (f.previousName !== undefined && !oldNames.has(f.previousName)) {
      throw new ValidationError(`previousName '${f.previousName}' was not in the prior definition`, {
        issues: [{ path: ['fields', parsed.fields.indexOf(f), 'previousName'] }],
      })
    }
  }

  await ensureValidCrossField(db, parsed, handle)

  const renames = computeRenames(parsed.fields)
  const canonical = stripRenames(parsed)

  for (const [oldName, newName] of renames) {
    // Per-locale content lives in `vulse_entry_locales`. Rename keys in both
    // the live `content` and the in-flight `draft_content` when present.
    await db.run(sql`
      UPDATE vulse_entry_locales
      SET content = json_set(
        json_remove(content, '$.' || ${oldName}),
        '$.' || ${newName},
        json_extract(content, '$.' || ${oldName})
      )
      WHERE collection = ${handle}
        AND json_extract(content, '$.' || ${oldName}) IS NOT NULL
    `)
    await db.run(sql`
      UPDATE vulse_entry_locales
      SET draft_content = json_set(
        json_remove(draft_content, '$.' || ${oldName}),
        '$.' || ${newName},
        json_extract(draft_content, '$.' || ${oldName})
      )
      WHERE collection = ${handle}
        AND draft_content IS NOT NULL
        AND json_extract(draft_content, '$.' || ${oldName}) IS NOT NULL
    `)
  }
  await db.update(vulseCollections).set({
    label: canonical.label,
    definition: canonical,
    blueprintHash: hashDefinition(canonical),
    singleton: canonical.singleton,
    tree: canonical.tree === true,
    drafts: canonical.drafts === true,
    updatedAt: new Date(),
  }).where(eq(vulseCollections.handle, handle))

  return canonical
}

export async function deleteBlueprint(db: VulseDb, handle: string): Promise<void> {
  const existing = await db.select({ handle: vulseCollections.handle })
    .from(vulseCollections)
    .where(eq(vulseCollections.handle, handle))
    .get()
  if (!existing) throw new NotFoundError(`blueprint not found: ${handle}`)
  await db.delete(vulseCollections).where(eq(vulseCollections.handle, handle))
}

export async function listBlueprintDefinitions(db: VulseDb): Promise<BlueprintDefinition[]> {
  const rows = await db.select({ definition: vulseCollections.definition })
    .from(vulseCollections)
    .orderBy(asc(vulseCollections.createdAt))
  return rows.map((r) => BlueprintDefinitionSchema.parse(r.definition))
}

export async function getBlueprintDefinition(db: VulseDb, handle: string): Promise<BlueprintDefinition | null> {
  const row = await db.select({ definition: vulseCollections.definition })
    .from(vulseCollections)
    .where(eq(vulseCollections.handle, handle))
    .get()
  if (!row) return null
  return BlueprintDefinitionSchema.parse(row.definition)
}

async function validateNew(db: VulseDb, input: BlueprintDefinition): Promise<BlueprintDefinition> {
  const def = parseOrThrow(BlueprintDefinitionSchema, input)
  const dup = await db.select({ handle: vulseCollections.handle })
    .from(vulseCollections)
    .where(eq(vulseCollections.handle, def.handle))
    .get()
  if (dup) {
    throw new ValidationError(`handle '${def.handle}' already exists`, { issues: [{ path: ['handle'] }] })
  }
  await ensureValidCrossField(db, def, null)
  return def
}

async function ensureValidCrossField(
  db: VulseDb,
  def: BlueprintDefinition | BlueprintDefinitionWithRenames,
  selfHandle: string | null,
): Promise<void> {
  await ensureValidFieldList(db, def.fields, ['fields'], selfHandle ?? def.handle)
}

async function ensureValidFieldList(
  db: VulseDb,
  fields: Array<{ name: string; ui: FieldUi } | NestedFieldDefinition>,
  path: Array<string | number>,
  currentHandle: string,
): Promise<void> {
  const seen = new Set<string>()
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!
    if (seen.has(f.name)) {
      throw new ValidationError(`duplicate field name '${f.name}'`, { issues: [{ path: [...path, i, 'name'] }] })
    }
    seen.add(f.name)
  }

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!
    if (f.ui.kind === 'relationship' && 'to' in f.ui) {
      if (f.ui.to === currentHandle) continue
      const target = await db.select({ handle: vulseCollections.handle })
        .from(vulseCollections)
        .where(eq(vulseCollections.handle, f.ui.to))
        .get()
      if (!target) {
        throw new ValidationError(`relationship target '${f.ui.to}' does not exist`, {
          issues: [{ path: [...path, i, 'ui', 'to'] }],
        })
      }
    }

    if (f.ui.kind === 'replicator' && 'sets' in f.ui) {
      const seenSets = new Set<string>()
      for (let j = 0; j < f.ui.sets.length; j++) {
        const set = f.ui.sets[j]!
        if (seenSets.has(set.name)) {
          throw new ValidationError(`duplicate set name '${set.name}'`, {
            issues: [{ path: [...path, i, 'ui', 'sets', j, 'name'] }],
          })
        }
        seenSets.add(set.name)
        await ensureValidFieldList(db, set.fields, [...path, i, 'ui', 'sets', j, 'fields'], currentHandle)
      }
    }
  }
}

function computeRenames(fields: FieldDefinitionWithRename[]): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const f of fields) {
    if (f.previousName !== undefined && f.previousName !== f.name) {
      out.push([f.previousName, f.name])
    }
  }
  return out
}

function stripRenames(def: BlueprintDefinitionWithRenames): BlueprintDefinition {
  return {
    handle: def.handle,
    label: def.label,
    singleton: def.singleton,
    ...(def.tree !== undefined ? { tree: def.tree } : {}),
    ...(def.maxDepth !== undefined ? { maxDepth: def.maxDepth } : {}),
    ...(def.drafts !== undefined ? { drafts: def.drafts } : {}),
    ...(def.seo !== undefined ? { seo: def.seo } : {}),
    ...(def.seoMapping !== undefined ? { seoMapping: def.seoMapping } : {}),
    ...(def.preview !== undefined ? { preview: def.preview } : {}),
    fields: def.fields.map(({ previousName: _previousName, ...rest }) => rest),
  }
}

async function loadDefinition(db: VulseDb, handle: string): Promise<BlueprintDefinition | null> {
  const row = await db.select({ definition: vulseCollections.definition })
    .from(vulseCollections)
    .where(eq(vulseCollections.handle, handle))
    .get()
  if (!row) return null
  return BlueprintDefinitionSchema.parse(row.definition)
}

function parseOrThrow<T>(
  schema: {
    safeParse: (x: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } }
  },
  value: unknown,
): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ValidationError('Validation failed', { issues: result.error.issues })
  }
  return result.data
}
