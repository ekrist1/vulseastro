import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import { entries, entryRevisions } from '../schema.js'
import { NotFoundError } from '../errors.js'

export interface EntryRow {
  id: string
  collection: string
  slug: string
  status: 'draft' | 'published'
  locale: string
  version: number
  content: unknown
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
  updatedBy: string | null
}

export interface ListOptions {
  collection: string
  status?: 'draft' | 'published'
  limit?: number
  offset?: number
}

export class EntriesRepo {
  constructor(private db: VulseDb) {}

  async create(input: {
    collection: string; slug: string; content: unknown; createdBy: string;
    status?: 'draft' | 'published'; locale?: string;
  }): Promise<EntryRow> {
    const now = new Date()
    const row = {
      id: nanoid(),
      collection: input.collection,
      slug: input.slug,
      status: input.status ?? 'draft',
      locale: input.locale ?? 'default',
      version: 1,
      content: input.content,
      publishedAt: input.status === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    } as const
    await this.db.batch([
      this.db.insert(entries).values(row),
      this.db.insert(entryRevisions).values({
        id: nanoid(),
        entryId: row.id,
        version: 1,
        content: input.content,
        authorId: input.createdBy,
        changeSummary: null,
        createdAt: now,
      }),
    ])
    return row as EntryRow
  }

  async findById(id: string): Promise<EntryRow | null> {
    const [row] = await this.db.select().from(entries).where(eq(entries.id, id))
    return (row as EntryRow | undefined) ?? null
  }

  async findBySlug(collection: string, slug: string, locale = 'default'): Promise<EntryRow | null> {
    const [row] = await this.db.select().from(entries).where(
      and(eq(entries.collection, collection), eq(entries.slug, slug), eq(entries.locale, locale)),
    )
    return (row as EntryRow | undefined) ?? null
  }

  async list(opts: ListOptions): Promise<EntryRow[]> {
    const conditions = [eq(entries.collection, opts.collection)]
    if (opts.status) conditions.push(eq(entries.status, opts.status))

    const base = this.db.select().from(entries).where(and(...conditions)).orderBy(desc(entries.updatedAt))
    const limited = opts.limit !== undefined ? base.limit(opts.limit) : base
    const paged = opts.offset !== undefined ? limited.offset(opts.offset) : limited
    return await paged as EntryRow[]
  }

  async update(id: string, patch: { content?: unknown; status?: 'draft' | 'published'; slug?: string; updatedBy: string }): Promise<EntryRow> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError(`Entry ${id} not found`)
    const now = new Date()
    const next = {
      content: patch.content ?? existing.content,
      slug: patch.slug ?? existing.slug,
      status: patch.status ?? existing.status,
      version: existing.version + 1,
      publishedAt: patch.status === 'published' && !existing.publishedAt ? now : existing.publishedAt,
      updatedAt: now,
      updatedBy: patch.updatedBy,
    }
    await this.db.update(entries).set(next).where(eq(entries.id, id))
    return { ...existing, ...next }
  }

  async updateWithRevision(id: string, patch: {
    content?: unknown; status?: 'draft' | 'published'; slug?: string;
    updatedBy: string; changeSummary?: string;
  }): Promise<EntryRow> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError(`Entry ${id} not found`)
    const now = new Date()
    const nextVersion = existing.version + 1
    const nextContent = patch.content ?? existing.content
    await this.db.batch([
      this.db.insert(entryRevisions).values({
        id: nanoid(), entryId: id, version: nextVersion, content: nextContent,
        authorId: patch.updatedBy, changeSummary: patch.changeSummary ?? null, createdAt: now,
      }),
      this.db.update(entries).set({
        content: nextContent,
        slug: patch.slug ?? existing.slug,
        status: patch.status ?? existing.status,
        version: nextVersion,
        publishedAt: patch.status === 'published' && !existing.publishedAt ? now : existing.publishedAt,
        updatedAt: now,
        updatedBy: patch.updatedBy,
      }).where(eq(entries.id, id)),
    ])
    return {
      ...existing,
      content: nextContent,
      slug: patch.slug ?? existing.slug,
      status: patch.status ?? existing.status,
      version: nextVersion,
      publishedAt: patch.status === 'published' && !existing.publishedAt ? now : existing.publishedAt,
      updatedAt: now,
      updatedBy: patch.updatedBy,
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(entries).where(eq(entries.id, id))
  }
}
