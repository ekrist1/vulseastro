import { nanoid } from 'nanoid'
import { eq, sql } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulseRedirects } from '../schema.js'

export type RedirectStatus = 301 | 302 | 307 | 308

export interface RedirectRow {
  id: string
  fromPath: string
  toUrl: string
  status: RedirectStatus
  enabled: boolean
  hits: number
  lastHitAt: Date | null
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
}

function mapRow(row: typeof vulseRedirects.$inferSelect): RedirectRow {
  return {
    id: row.id,
    fromPath: row.fromPath,
    toUrl: row.toUrl,
    status: row.status as RedirectStatus,
    enabled: row.enabled,
    hits: row.hits,
    lastHitAt: row.lastHitAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy ?? null,
  }
}

// `from_path` is stored in normalized form (leading slash, no trailing slash
// except for root, lowercased) so middleware lookups are case-insensitive and
// trailing-slash tolerant.
export function normalizePath(p: string): string {
  let path = p.trim()
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path.toLowerCase()
}

export class RedirectsRepo {
  constructor(private db: VulseDb) {}

  async list(): Promise<RedirectRow[]> {
    const rows = await this.db.select().from(vulseRedirects)
    return rows.map(mapRow)
  }

  async findById(id: string): Promise<RedirectRow | null> {
    const [row] = await this.db.select().from(vulseRedirects).where(eq(vulseRedirects.id, id))
    return row ? mapRow(row) : null
  }

  async findByPath(path: string): Promise<RedirectRow | null> {
    const [row] = await this.db.select().from(vulseRedirects).where(eq(vulseRedirects.fromPath, normalizePath(path)))
    return row ? mapRow(row) : null
  }

  async create(input: {
    fromPath: string
    toUrl: string
    status?: RedirectStatus
    enabled?: boolean
    createdBy?: string | null
  }): Promise<RedirectRow> {
    const now = new Date()
    const row = {
      id: nanoid(16),
      fromPath: normalizePath(input.fromPath),
      toUrl: input.toUrl.trim(),
      status: input.status ?? 301,
      enabled: input.enabled ?? true,
      hits: 0,
      lastHitAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
    }
    await this.db.insert(vulseRedirects).values(row)
    return mapRow(row as typeof vulseRedirects.$inferSelect)
  }

  async update(id: string, patch: {
    fromPath?: string
    toUrl?: string
    status?: RedirectStatus
    enabled?: boolean
  }): Promise<RedirectRow | null> {
    const set: Partial<typeof vulseRedirects.$inferInsert> = { updatedAt: new Date() }
    if (patch.fromPath !== undefined) set.fromPath = normalizePath(patch.fromPath)
    if (patch.toUrl !== undefined) set.toUrl = patch.toUrl.trim()
    if (patch.status !== undefined) set.status = patch.status
    if (patch.enabled !== undefined) set.enabled = patch.enabled
    await this.db.update(vulseRedirects).set(set).where(eq(vulseRedirects.id, id))
    return await this.findById(id)
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.delete(vulseRedirects).where(eq(vulseRedirects.id, id))
    return (res as { meta?: { changes?: number } }).meta?.changes ? true : true
  }

  async recordHit(id: string): Promise<void> {
    await this.db
      .update(vulseRedirects)
      .set({ hits: sql`${vulseRedirects.hits} + 1`, lastHitAt: new Date() })
      .where(eq(vulseRedirects.id, id))
  }
}
