import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import { entries, entryRevisions } from '../schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { isValidSlug, normalizeSlug } from '../slug.js'

export interface EntryRow {
  id: string
  collection: string
  parentId: string | null
  sortOrder: number
  slug: string
  status: 'draft' | 'published'
  locale: string
  version: number
  content: unknown
  draftContent: unknown | null
  hasUnpublishedChanges: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
  updatedBy: string | null
}

export interface EntryNode extends EntryRow {
  children: EntryNode[]
}

export interface ListOptions {
  collection: string
  status?: 'draft' | 'published'
  parentId?: string | null
  limit?: number
  offset?: number
}

function rowToEntry(row: typeof entries.$inferSelect): EntryRow {
  return {
    id: row.id,
    collection: row.collection,
    parentId: row.parentId ?? null,
    sortOrder: row.sortOrder,
    slug: row.slug,
    status: row.status,
    locale: row.locale,
    version: row.version,
    content: row.content,
    draftContent: row.draftContent ?? null,
    hasUnpublishedChanges: row.draftContent != null,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  }
}

export class EntriesRepo {
  constructor(private db: VulseDb) {}

  private async resolveUniqueSlug(
    collection: string,
    desired: string,
    locale: string,
    excludeId?: string,
  ): Promise<string> {
    const base = normalizeSlug(desired)
    if (!base || !isValidSlug(base)) {
      throw new ValidationError('URL slug must use lowercase letters, numbers, and hyphens only.', {
        field: 'slug',
        issues: [{ path: ['slug'], message: 'Use lowercase letters, numbers, and hyphens only.' }],
      })
    }

    let suffix = 1
    for (;;) {
      const candidate = suffix === 1 ? base : `${base}-${suffix}`
      const existing = await this.findBySlug(collection, candidate, locale)
      if (!existing || existing.id === excludeId) return candidate
      suffix++
    }
  }

  private isSlugUniqueViolation(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err)
    return message.includes('UNIQUE constraint failed') && message.includes('slug')
  }

  async maxSortOrder(collection: string, parentId: string | null): Promise<number> {
    const conds = [eq(entries.collection, collection)]
    conds.push(parentId ? eq(entries.parentId, parentId) : isNull(entries.parentId))
    const [row] = await this.db.select({ max: sql<number>`coalesce(max(${entries.sortOrder}), 0)` })
      .from(entries)
      .where(and(...conds))
    return row?.max ?? 0
  }

  async create(input: {
    collection: string
    slug: string
    content: unknown
    createdBy: string
    status?: 'draft' | 'published'
    locale?: string
    parentId?: string | null
    draftsEnabled?: boolean
  }): Promise<EntryRow> {
    const locale = input.locale ?? 'default'
    const slug = await this.resolveUniqueSlug(input.collection, input.slug, locale)
    const now = new Date()
    const sortOrder = (await this.maxSortOrder(input.collection, input.parentId ?? null)) + 1
    const publishNow = !input.draftsEnabled && (input.status ?? 'draft') === 'published'
    const row = {
      id: nanoid(),
      collection: input.collection,
      parentId: input.parentId ?? null,
      sortOrder,
      slug,
      status: publishNow ? 'published' as const : (input.status ?? 'draft'),
      locale,
      version: 1,
      content: input.draftsEnabled && !publishNow ? {} : input.content,
      draftContent: input.draftsEnabled && !publishNow ? input.content : null,
      publishedAt: publishNow ? now : null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    }

    try {
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
    } catch (err) {
      if (!this.isSlugUniqueViolation(err)) throw err
      row.slug = await this.resolveUniqueSlug(input.collection, slug, locale)
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
    }

    return rowToEntry(row as typeof entries.$inferSelect)
  }

  async findById(id: string): Promise<EntryRow | null> {
    const [row] = await this.db.select().from(entries).where(eq(entries.id, id))
    return row ? rowToEntry(row) : null
  }

  async findBySlug(collection: string, slug: string, locale = 'default'): Promise<EntryRow | null> {
    const [row] = await this.db.select().from(entries).where(
      and(eq(entries.collection, collection), eq(entries.slug, slug), eq(entries.locale, locale)),
    )
    return row ? rowToEntry(row) : null
  }

  async list(opts: ListOptions): Promise<EntryRow[]> {
    const conditions = [eq(entries.collection, opts.collection)]
    if (opts.status) conditions.push(eq(entries.status, opts.status))
    if (opts.parentId !== undefined) {
      conditions.push(opts.parentId === null ? isNull(entries.parentId) : eq(entries.parentId, opts.parentId))
    }

    const base = this.db.select().from(entries).where(and(...conditions))
      .orderBy(asc(entries.sortOrder), desc(entries.updatedAt))
    const limited = opts.limit !== undefined ? base.limit(opts.limit) : base
    const paged = opts.offset !== undefined ? limited.offset(opts.offset) : limited
    const rows = await paged
    return rows.map(rowToEntry)
  }

  async tree(collection: string): Promise<EntryNode[]> {
    const rows = await this.db.select().from(entries)
      .where(eq(entries.collection, collection))
      .orderBy(asc(entries.sortOrder), desc(entries.updatedAt))
    const byParent = new Map<string | null, EntryNode[]>()
    for (const row of rows) {
      const node: EntryNode = { ...rowToEntry(row), children: [] }
      const bucket = byParent.get(node.parentId) ?? []
      bucket.push(node)
      byParent.set(node.parentId, bucket)
    }
    function attach(parentId: string | null): EntryNode[] {
      const children = byParent.get(parentId) ?? []
      for (const child of children) child.children = attach(child.id)
      return children
    }
    return attach(null)
  }

  async move(collection: string, id: string, input: { parentId: string | null; sortOrder?: number }): Promise<EntryRow> {
    const existing = await this.findById(id)
    if (!existing || existing.collection !== collection) throw new NotFoundError(`Entry ${id} not found`)
    if (input.parentId === id) throw new ValidationError('An entry cannot be its own parent')
    const sortOrder = input.sortOrder ?? (await this.maxSortOrder(collection, input.parentId)) + 1
    const now = new Date()
    await this.db.update(entries).set({
      parentId: input.parentId,
      sortOrder,
      updatedAt: now,
    }).where(eq(entries.id, id))
    const updated = await this.findById(id)
    if (!updated) throw new NotFoundError(`Entry ${id} not found`)
    return updated
  }

  async updateWithRevision(id: string, patch: {
    content?: unknown
    status?: 'draft' | 'published'
    slug?: string
    updatedBy: string
    changeSummary?: string
    publish?: boolean
    draftsEnabled?: boolean
  }): Promise<EntryRow> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError(`Entry ${id} not found`)
    let nextSlug = existing.slug
    if (patch.slug !== undefined && patch.slug !== existing.slug) {
      nextSlug = await this.resolveUniqueSlug(existing.collection, patch.slug, existing.locale, id)
    }
    const now = new Date()
    const nextVersion = existing.version + 1
    const workingContent = patch.content ?? (
      patch.draftsEnabled && existing.draftContent != null ? existing.draftContent : existing.content
    )

    if (patch.draftsEnabled) {
      const publishNow = patch.publish === true
      const next = publishNow
        ? {
            content: workingContent,
            draftContent: null,
            status: 'published' as const,
            publishedAt: existing.publishedAt ?? now,
            slug: nextSlug,
            version: nextVersion,
            updatedAt: now,
            updatedBy: patch.updatedBy,
          }
        : {
            content: existing.content,
            draftContent: workingContent,
            status: existing.status,
            publishedAt: existing.publishedAt,
            slug: nextSlug,
            version: nextVersion,
            updatedAt: now,
            updatedBy: patch.updatedBy,
          }

      await this.db.batch([
        this.db.insert(entryRevisions).values({
          id: nanoid(), entryId: id, version: nextVersion, content: workingContent,
          authorId: patch.updatedBy, changeSummary: patch.changeSummary ?? null, createdAt: now,
        }),
        this.db.update(entries).set(next).where(eq(entries.id, id)),
      ])
      return { ...existing, ...next, draftContent: next.draftContent ?? null, hasUnpublishedChanges: next.draftContent != null }
    }

    const nextContent = patch.content ?? existing.content
    await this.db.batch([
      this.db.insert(entryRevisions).values({
        id: nanoid(), entryId: id, version: nextVersion, content: nextContent,
        authorId: patch.updatedBy, changeSummary: patch.changeSummary ?? null, createdAt: now,
      }),
      this.db.update(entries).set({
        content: nextContent,
        slug: nextSlug,
        status: patch.status ?? existing.status,
        version: nextVersion,
        publishedAt: (patch.status ?? existing.status) === 'published' && !existing.publishedAt ? now : existing.publishedAt,
        updatedAt: now,
        updatedBy: patch.updatedBy,
      }).where(eq(entries.id, id)),
    ])
    return {
      ...existing,
      content: nextContent,
      slug: nextSlug,
      status: patch.status ?? existing.status,
      version: nextVersion,
      publishedAt: (patch.status ?? existing.status) === 'published' && !existing.publishedAt ? now : existing.publishedAt,
      updatedAt: now,
      updatedBy: patch.updatedBy,
      hasUnpublishedChanges: false,
    }
  }

  async publish(id: string, updatedBy: string): Promise<EntryRow> {
    return this.updateWithRevision(id, { publish: true, draftsEnabled: true, updatedBy })
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(entries).where(eq(entries.id, id))
  }
}
