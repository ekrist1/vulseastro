import { eq } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulseSets } from '../schema.js'
import { ValidationError } from '../errors.js'
import { type SetDefinition, SetDefinitionSchema } from './definition.js'

export interface SetDTO extends SetDefinition {
  createdAt: string
  updatedAt: string
}

function parseRow(row: {
  handle: string
  definition: unknown
  createdAt: Date
  updatedAt: Date
}): SetDTO {
  const def = SetDefinitionSchema.parse(row.definition)
  return {
    ...def,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function createSet(db: VulseDb, input: SetDefinition): Promise<SetDTO> {
  const parsed = SetDefinitionSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid set', { issues: parsed.error.issues })
  const def = parsed.data
  const now = new Date()
  await db.insert(vulseSets).values({
    handle: def.handle,
    label: def.label,
    definition: def,
    createdAt: now,
    updatedAt: now,
  })
  const created = await getSet(db, def.handle)
  if (!created) throw new Error(`set not found after create: ${def.handle}`)
  return created
}

export async function listSets(db: VulseDb): Promise<SetDTO[]> {
  const rows = await db.select().from(vulseSets).orderBy(vulseSets.createdAt)
  return rows.map(parseRow)
}

export async function getSet(db: VulseDb, handle: string): Promise<SetDTO | null> {
  const row = await db.select().from(vulseSets).where(eq(vulseSets.handle, handle)).get()
  return row ? parseRow(row) : null
}

export async function updateSet(db: VulseDb, handle: string, input: SetDefinition): Promise<SetDTO> {
  if (input.handle !== handle) {
    throw new Error(`set handle is immutable (got '${input.handle}', expected '${handle}')`)
  }
  const parsed = SetDefinitionSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid set', { issues: parsed.error.issues })
  const def = parsed.data
  await db.update(vulseSets).set({
    label: def.label,
    definition: def,
    updatedAt: new Date(),
  }).where(eq(vulseSets.handle, handle))
  const out = await getSet(db, handle)
  if (!out) throw new Error(`set not found: ${handle}`)
  return out
}

export async function deleteSet(db: VulseDb, handle: string): Promise<void> {
  await db.delete(vulseSets).where(eq(vulseSets.handle, handle))
}

export async function loadCompiledSets(db: VulseDb): Promise<Map<string, import('./compile.js').CompiledSet>> {
  const { compileSet } = await import('./compile.js')
  const rows = await listSets(db)
  const map = new Map<string, import('./compile.js').CompiledSet>()
  for (const row of rows) {
    map.set(row.handle, compileSet(row))
  }
  return map
}
