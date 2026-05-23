import { nanoid } from 'nanoid'
import { eq, lt } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulsePreviewSessions } from '../schema.js'

const DEFAULT_TTL_MS = 60 * 60 * 1000

export interface PreviewSessionRow {
  id: string
  userId: string
  entryId: string | null
  collection: string
  slug: string
  content: unknown
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

function mapRow(row: typeof vulsePreviewSessions.$inferSelect): PreviewSessionRow {
  return {
    id: row.id,
    userId: row.userId,
    entryId: row.entryId ?? null,
    collection: row.collection,
    slug: row.slug,
    content: row.content,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PreviewSessionsRepo {
  constructor(private db: VulseDb) {}

  async create(input: {
    userId: string
    collection: string
    slug: string
    content: unknown
    entryId?: string | null
    ttlMs?: number
  }): Promise<PreviewSessionRow> {
    const now = new Date()
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS
    const id = nanoid(32)
    const row = {
      id,
      userId: input.userId,
      entryId: input.entryId ?? null,
      collection: input.collection,
      slug: input.slug,
      content: input.content,
      expiresAt: new Date(now.getTime() + ttl),
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(vulsePreviewSessions).values(row)
    return mapRow(row)
  }

  async findById(id: string): Promise<PreviewSessionRow | null> {
    const row = await this.db.query.vulsePreviewSessions.findFirst({
      where: eq(vulsePreviewSessions.id, id),
    })
    if (!row) return null
    if (row.expiresAt.getTime() < Date.now()) return null
    return mapRow(row)
  }

  async update(id: string, userId: string, patch: { slug?: string; content?: unknown }): Promise<PreviewSessionRow | null> {
    const existing = await this.findById(id)
    if (!existing || existing.userId !== userId) return null
    const now = new Date()
    const next = {
      slug: patch.slug ?? existing.slug,
      content: patch.content ?? existing.content,
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS),
      updatedAt: now,
    }
    await this.db.update(vulsePreviewSessions).set(next).where(eq(vulsePreviewSessions.id, id))
    return { ...existing, ...next }
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await this.findById(id)
    if (!existing || existing.userId !== userId) return false
    await this.db.delete(vulsePreviewSessions).where(eq(vulsePreviewSessions.id, id))
    return true
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const expired = await this.db.select({ id: vulsePreviewSessions.id })
      .from(vulsePreviewSessions)
      .where(lt(vulsePreviewSessions.expiresAt, now))
    for (const row of expired) {
      await this.db.delete(vulsePreviewSessions).where(eq(vulsePreviewSessions.id, row.id))
    }
    return expired.length
  }
}
