import { eq } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulseGlobalSets, vulseGlobalValues } from '../schema.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import { loadCompiledSets } from '../sets/service.js'
import {
  type GlobalSetDefinition,
  GlobalSetDefinitionSchema,
  hashGlobalSetDefinition,
} from '../globals/definition.js'
import { compileGlobalSet } from '../globals/compile.js'

export interface GlobalSetRow {
  handle: string
  label: string
  definition: GlobalSetDefinition
  blueprintHash: string
  createdAt: Date
  updatedAt: Date
}

export interface GlobalValueRow {
  handle: string
  content: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type PublicGlobals = Record<string, Record<string, unknown>>

function parseSetRow(row: typeof vulseGlobalSets.$inferSelect): GlobalSetRow {
  return {
    handle: row.handle,
    label: row.label,
    definition: GlobalSetDefinitionSchema.parse(row.definition),
    blueprintHash: row.blueprintHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function parseValueRow(row: typeof vulseGlobalValues.$inferSelect): GlobalValueRow {
  return {
    handle: row.handle,
    content: (row.content ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class GlobalsRepo {
  constructor(private db: VulseDb) {}

  async listSets(): Promise<GlobalSetRow[]> {
    const rows = await this.db.select().from(vulseGlobalSets).orderBy(vulseGlobalSets.createdAt)
    return rows.map(parseSetRow)
  }

  async findSetByHandle(handle: string): Promise<GlobalSetRow | null> {
    const row = await this.db.select().from(vulseGlobalSets).where(eq(vulseGlobalSets.handle, handle)).get()
    return row ? parseSetRow(row) : null
  }

  async createSet(input: GlobalSetDefinition): Promise<GlobalSetRow> {
    const parsed = GlobalSetDefinitionSchema.safeParse(input)
    if (!parsed.success) throw new ValidationError('Invalid global set', { issues: parsed.error.issues })
    const def = parsed.data
    const existing = await this.findSetByHandle(def.handle)
    if (existing) throw new ConflictError(`global set already exists: ${def.handle}`)

    const now = new Date()
    const hash = hashGlobalSetDefinition(def)
    await this.db.insert(vulseGlobalSets).values({
      handle: def.handle,
      label: def.label,
      definition: def,
      blueprintHash: hash,
      createdAt: now,
      updatedAt: now,
    })
    await this.db.insert(vulseGlobalValues).values({
      handle: def.handle,
      content: {},
      createdAt: now,
      updatedAt: now,
    })

    const row = await this.findSetByHandle(def.handle)
    if (!row) throw new Error(`global set not found after create: ${def.handle}`)
    return row
  }

  async updateSet(handle: string, input: GlobalSetDefinition): Promise<GlobalSetRow> {
    if (input.handle !== handle) {
      throw new ValidationError('Global set handles are immutable', { issues: [{ path: ['handle'], message: 'Handle cannot be changed' }] })
    }
    const parsed = GlobalSetDefinitionSchema.safeParse(input)
    if (!parsed.success) throw new ValidationError('Invalid global set', { issues: parsed.error.issues })
    const def = parsed.data
    const existing = await this.findSetByHandle(handle)
    if (!existing) throw new NotFoundError('global set not found')

    await this.db.update(vulseGlobalSets).set({
      label: def.label,
      definition: def,
      blueprintHash: hashGlobalSetDefinition(def),
      updatedAt: new Date(),
    }).where(eq(vulseGlobalSets.handle, handle))

    const row = await this.findSetByHandle(handle)
    if (!row) throw new NotFoundError('global set not found')
    return row
  }

  async deleteSet(handle: string): Promise<void> {
    const existing = await this.findSetByHandle(handle)
    if (!existing) throw new NotFoundError('global set not found')
    await this.db.delete(vulseGlobalSets).where(eq(vulseGlobalSets.handle, handle))
  }

  async getValue(handle: string): Promise<GlobalValueRow | null> {
    const set = await this.findSetByHandle(handle)
    if (!set) return null
    const row = await this.db.select().from(vulseGlobalValues).where(eq(vulseGlobalValues.handle, handle)).get()
    return row ? parseValueRow(row) : null
  }

  async updateValue(handle: string, input: unknown): Promise<GlobalValueRow> {
    const set = await this.findSetByHandle(handle)
    if (!set) throw new NotFoundError('global set not found')

    const sets = await loadCompiledSets(this.db)
    const compiled = compileGlobalSet(set.definition, sets)
    const result = compiled.schema.safeParse(input)
    if (!result.success) {
      throw new ValidationError('Invalid global value', { issues: result.error.issues })
    }

    const now = new Date()
    const content = result.data as Record<string, unknown>
    await this.db.insert(vulseGlobalValues).values({
      handle,
      content,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: vulseGlobalValues.handle,
      set: { content, updatedAt: now },
    })

    const row = await this.getValue(handle)
    if (!row) throw new Error(`global value not found after update: ${handle}`)
    return row
  }

  async publicValues(): Promise<PublicGlobals> {
    const rows = await this.db
      .select({
        handle: vulseGlobalValues.handle,
        content: vulseGlobalValues.content,
      })
      .from(vulseGlobalValues)
      .innerJoin(vulseGlobalSets, eq(vulseGlobalValues.handle, vulseGlobalSets.handle))
      .orderBy(vulseGlobalSets.createdAt)

    const out: PublicGlobals = {}
    for (const row of rows) {
      out[row.handle] = (row.content ?? {}) as Record<string, unknown>
    }
    return out
  }

  async publicValue(handle: string): Promise<Record<string, unknown> | null> {
    const set = await this.findSetByHandle(handle)
    if (!set) return null
    const value = await this.getValue(handle)
    return value?.content ?? {}
  }
}
