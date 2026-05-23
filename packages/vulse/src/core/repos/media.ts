import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import { media } from '../schema.js'
import { NotFoundError } from '../errors.js'

export interface MediaRow {
  id: string
  r2Key: string
  mime: string
  size: number
  width: number | null
  height: number | null
  alt: string | null
  blurhash: string | null
  uploadedBy: string | null
  createdAt: Date
  deletedAt: Date | null
}

function rowToMedia(row: typeof media.$inferSelect): MediaRow {
  return {
    id: row.id,
    r2Key: row.r2Key,
    mime: row.mime,
    size: row.size,
    width: row.width ?? null,
    height: row.height ?? null,
    alt: row.alt ?? null,
    blurhash: row.blurhash ?? null,
    uploadedBy: row.uploadedBy ?? null,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt ?? null,
  }
}

export class MediaRepo {
  constructor(private db: VulseDb) {}

  async create(input: {
    r2Key: string
    mime: string
    size: number
    uploadedBy?: string | null
    width?: number | null
    height?: number | null
    alt?: string | null
    blurhash?: string | null
  }): Promise<MediaRow> {
    const now = new Date()
    const row = {
      id: nanoid(),
      r2Key: input.r2Key,
      mime: input.mime,
      size: input.size,
      width: input.width ?? null,
      height: input.height ?? null,
      alt: input.alt ?? null,
      blurhash: input.blurhash ?? null,
      uploadedBy: input.uploadedBy ?? null,
      createdAt: now,
      deletedAt: null,
    }
    await this.db.insert(media).values(row)
    return rowToMedia(row as typeof media.$inferSelect)
  }

  async list(opts: { includeDeleted?: boolean; limit?: number; offset?: number } = {}): Promise<MediaRow[]> {
    const conditions = opts.includeDeleted ? undefined : isNull(media.deletedAt)
    let query = this.db.select().from(media)
    if (conditions) query = query.where(conditions) as typeof query
    query = query.orderBy(desc(media.createdAt)) as typeof query
    if (opts.limit !== undefined) query = query.limit(opts.limit) as typeof query
    if (opts.offset !== undefined) query = query.offset(opts.offset) as typeof query
    const rows = await query
    return rows.map(rowToMedia)
  }

  async findById(id: string): Promise<MediaRow | null> {
    const [row] = await this.db.select().from(media).where(eq(media.id, id))
    return row ? rowToMedia(row) : null
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError(`Media ${id} not found`)
    await this.db.update(media).set({ deletedAt: new Date() }).where(eq(media.id, id))
  }

  async updateAlt(id: string, alt: string): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError(`Media ${id} not found`)
    await this.db.update(media).set({ alt }).where(eq(media.id, id))
  }

  async listPurgeable(days: number): Promise<MediaRow[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000)
    const rows = await this.db.select().from(media)
      .where(and(isNotNull(media.deletedAt), lt(media.deletedAt, cutoff)))
    return rows.map(rowToMedia)
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.delete(media).where(eq(media.id, id))
  }
}
