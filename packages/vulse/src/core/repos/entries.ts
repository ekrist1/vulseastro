import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import { entries, entryLocales, entryRevisions } from '../schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { isValidSlug, normalizeSlug } from '../slug.js'

export const DEFAULT_LOCALE = 'default'

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

export interface EntryLocaleSummary {
  locale: string
  slug: string
  status: 'draft' | 'published'
  hasUnpublishedChanges: boolean
  publishedAt: Date | null
  updatedAt: Date
}

export type EntryOrderBy = 'sortOrder' | 'publishedAt' | 'updatedAt' | 'createdAt'

export interface ListOptions {
  collection: string
  locale?: string
  status?: 'draft' | 'published'
  parentId?: string | null
  limit?: number
  offset?: number
  createdBy?: string
  publishedAfter?: Date
  publishedBefore?: Date
  orderBy?: EntryOrderBy
  order?: 'asc' | 'desc'
}

type EntryShell = typeof entries.$inferSelect
type EntryLocale = typeof entryLocales.$inferSelect

export function joinToEntry(shell: EntryShell, locale: EntryLocale): EntryRow {
  return {
    id: shell.id,
    collection: shell.collection,
    parentId: shell.parentId ?? null,
    sortOrder: shell.sortOrder,
    slug: locale.slug,
    status: locale.status,
    locale: locale.locale,
    version: locale.version,
    content: locale.content,
    draftContent: locale.draftContent ?? null,
    hasUnpublishedChanges: locale.draftContent != null,
    publishedAt: locale.publishedAt,
    createdAt: shell.createdAt,
    updatedAt: locale.updatedAt,
    createdBy: shell.createdBy,
    updatedBy: locale.updatedBy,
  }
}

export class EntriesRepo {
  constructor(private db: VulseDb) {}

  private async resolveUniqueSlug(
    collection: string,
    locale: string,
    desired: string,
    excludeEntryId?: string,
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
      const [existing] = await this.db.select({ entryId: entryLocales.entryId })
        .from(entryLocales)
        .where(and(
          eq(entryLocales.collection, collection),
          eq(entryLocales.locale, locale),
          eq(entryLocales.slug, candidate),
        ))
        .limit(1)
      if (!existing || existing.entryId === excludeEntryId) return candidate
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

  /** True if the proposed parent would create a cycle (parent is a descendant of id). */
  private async wouldCreateCycle(id: string, proposedParentId: string | null): Promise<boolean> {
    if (proposedParentId === null) return false
    if (proposedParentId === id) return true
    // Walk parent chain upward from proposedParentId; if we hit `id`, it's a cycle.
    const seen = new Set<string>()
    let current: string | null = proposedParentId
    while (current) {
      if (seen.has(current)) return false // pre-existing cycle, but not caused by this move
      seen.add(current)
      if (current === id) return true
      const [row] = await this.db.select({ parentId: entries.parentId })
        .from(entries).where(eq(entries.id, current)).limit(1)
      current = row?.parentId ?? null
    }
    return false
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
    const locale = input.locale ?? DEFAULT_LOCALE
    const slug = await this.resolveUniqueSlug(input.collection, locale, input.slug)
    const now = new Date()
    const sortOrder = (await this.maxSortOrder(input.collection, input.parentId ?? null)) + 1
    const publishNow = !input.draftsEnabled && (input.status ?? 'draft') === 'published'

    const entryId = nanoid()
    const shellRow = {
      id: entryId,
      collection: input.collection,
      parentId: input.parentId ?? null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    }
    const localeRow = {
      entryId,
      collection: input.collection,
      locale,
      slug,
      status: publishNow ? 'published' as const : (input.status ?? 'draft'),
      version: 1,
      content: input.draftsEnabled && !publishNow ? {} : input.content,
      draftContent: input.draftsEnabled && !publishNow ? input.content : null,
      publishedAt: publishNow ? now : null,
      updatedAt: now,
      updatedBy: input.createdBy,
    }

    const insertStmts = () => [
      this.db.insert(entries).values(shellRow),
      this.db.insert(entryLocales).values(localeRow),
      this.db.insert(entryRevisions).values({
        id: nanoid(),
        entryId,
        locale,
        version: 1,
        content: input.content,
        authorId: input.createdBy,
        changeSummary: null,
        createdAt: now,
      }),
    ] as const

    try {
      const [a, b, c] = insertStmts()
      await this.db.batch([a, b, c])
    } catch (err) {
      if (!this.isSlugUniqueViolation(err)) throw err
      localeRow.slug = await this.resolveUniqueSlug(input.collection, locale, slug)
      const [a, b, c] = insertStmts()
      await this.db.batch([a, b, c])
    }

    return joinToEntry(shellRow as EntryShell, localeRow as EntryLocale)
  }

  /** Add a new locale translation to an existing entry. */
  async createLocale(entryId: string, input: {
    locale: string
    slug: string
    content: unknown
    updatedBy: string
    status?: 'draft' | 'published'
    draftsEnabled?: boolean
  }): Promise<EntryRow> {
    const shell = await this.findShellById(entryId)
    if (!shell) throw new NotFoundError(`Entry ${entryId} not found`)
    const slug = await this.resolveUniqueSlug(shell.collection, input.locale, input.slug)
    const now = new Date()
    const publishNow = !input.draftsEnabled && (input.status ?? 'draft') === 'published'
    const localeRow = {
      entryId,
      collection: shell.collection,
      locale: input.locale,
      slug,
      status: publishNow ? 'published' as const : (input.status ?? 'draft'),
      version: 1,
      content: input.draftsEnabled && !publishNow ? {} : input.content,
      draftContent: input.draftsEnabled && !publishNow ? input.content : null,
      publishedAt: publishNow ? now : null,
      updatedAt: now,
      updatedBy: input.updatedBy,
    }
    await this.db.batch([
      this.db.insert(entryLocales).values(localeRow),
      this.db.insert(entryRevisions).values({
        id: nanoid(),
        entryId,
        locale: input.locale,
        version: 1,
        content: input.content,
        authorId: input.updatedBy,
        changeSummary: null,
        createdAt: now,
      }),
      this.db.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId)),
    ])
    return joinToEntry({ ...shell, updatedAt: now }, localeRow as EntryLocale)
  }

  async findShellById(id: string): Promise<EntryShell | null> {
    const [row] = await this.db.select().from(entries).where(eq(entries.id, id)).limit(1)
    return row ?? null
  }

  async findById(id: string, locale: string = DEFAULT_LOCALE): Promise<EntryRow | null> {
    const [shell] = await this.db.select().from(entries).where(eq(entries.id, id)).limit(1)
    if (!shell) return null
    const [loc] = await this.db.select().from(entryLocales)
      .where(and(eq(entryLocales.entryId, id), eq(entryLocales.locale, locale)))
      .limit(1)
    if (!loc) return null
    return joinToEntry(shell, loc)
  }

  /** Returns every locale row for an entry — used by the admin to render the locale picker. */
  async listLocales(id: string): Promise<EntryLocaleSummary[]> {
    const rows = await this.db.select({
      locale: entryLocales.locale,
      slug: entryLocales.slug,
      status: entryLocales.status,
      draftContent: entryLocales.draftContent,
      publishedAt: entryLocales.publishedAt,
      updatedAt: entryLocales.updatedAt,
    }).from(entryLocales).where(eq(entryLocales.entryId, id))
    return rows.map((r) => ({
      locale: r.locale,
      slug: r.slug,
      status: r.status,
      hasUnpublishedChanges: r.draftContent != null,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
    }))
  }

  async findBySlug(collection: string, slug: string, locale: string = DEFAULT_LOCALE): Promise<EntryRow | null> {
    const [loc] = await this.db.select().from(entryLocales).where(
      and(
        eq(entryLocales.collection, collection),
        eq(entryLocales.slug, slug),
        eq(entryLocales.locale, locale),
      ),
    ).limit(1)
    if (!loc) return null
    const [shell] = await this.db.select().from(entries).where(eq(entries.id, loc.entryId)).limit(1)
    if (!shell) return null
    return joinToEntry(shell, loc)
  }

  async list(opts: ListOptions): Promise<EntryRow[]> {
    const locale = opts.locale ?? DEFAULT_LOCALE
    const conditions = [
      eq(entries.collection, opts.collection),
      eq(entryLocales.locale, locale),
    ]
    if (opts.status) conditions.push(eq(entryLocales.status, opts.status))
    if (opts.parentId !== undefined) {
      conditions.push(opts.parentId === null ? isNull(entries.parentId) : eq(entries.parentId, opts.parentId))
    }
    if (opts.createdBy) conditions.push(eq(entries.createdBy, opts.createdBy))
    if (opts.publishedAfter) conditions.push(gte(entryLocales.publishedAt, opts.publishedAfter))
    if (opts.publishedBefore) conditions.push(lte(entryLocales.publishedAt, opts.publishedBefore))

    const direction = opts.order === 'asc' ? asc : desc
    const order =
      opts.orderBy === 'publishedAt' ? [direction(entryLocales.publishedAt)] as const
      : opts.orderBy === 'createdAt' ? [direction(entries.createdAt)] as const
      : opts.orderBy === 'updatedAt' ? [direction(entryLocales.updatedAt)] as const
      : [asc(entries.sortOrder), desc(entryLocales.updatedAt)] as const

    const base = this.db.select({ shell: entries, loc: entryLocales })
      .from(entries)
      .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
      .where(and(...conditions))
      .orderBy(...order)
    const limited = opts.limit !== undefined ? base.limit(opts.limit) : base
    const paged = opts.offset !== undefined ? limited.offset(opts.offset) : limited
    const rows = await paged
    return rows.map((r) => joinToEntry(r.shell, r.loc))
  }

  /** Fetch multiple entries by id at a single locale (used by relationship includes). */
  async findManyByIds(ids: string[], locale: string = DEFAULT_LOCALE): Promise<EntryRow[]> {
    if (ids.length === 0) return []
    const rows = await this.db.select({ shell: entries, loc: entryLocales })
      .from(entries)
      .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
      .where(and(inArray(entries.id, ids), eq(entryLocales.locale, locale)))
    return rows.map((r) => joinToEntry(r.shell, r.loc))
  }

  async tree(collection: string, locale: string = DEFAULT_LOCALE): Promise<EntryNode[]> {
    const rows = await this.db.select({ shell: entries, loc: entryLocales })
      .from(entries)
      .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
      .where(and(eq(entries.collection, collection), eq(entryLocales.locale, locale)))
      .orderBy(asc(entries.sortOrder), desc(entryLocales.updatedAt))

    const byParent = new Map<string | null, EntryNode[]>()
    for (const r of rows) {
      const node: EntryNode = { ...joinToEntry(r.shell, r.loc), children: [] }
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

  async move(collection: string, id: string, input: { parentId: string | null; sortOrder?: number }): Promise<EntryShell> {
    const shell = await this.findShellById(id)
    if (!shell || shell.collection !== collection) throw new NotFoundError(`Entry ${id} not found`)
    if (await this.wouldCreateCycle(id, input.parentId)) {
      throw new ValidationError('An entry cannot be moved under itself or one of its descendants.')
    }
    const sortOrder = input.sortOrder ?? (await this.maxSortOrder(collection, input.parentId)) + 1
    const now = new Date()
    await this.db.update(entries).set({
      parentId: input.parentId,
      sortOrder,
      updatedAt: now,
    }).where(eq(entries.id, id))
    const next = await this.findShellById(id)
    if (!next) throw new NotFoundError(`Entry ${id} not found`)
    return next
  }

  async updateWithRevision(id: string, patch: {
    locale?: string
    content?: unknown
    status?: 'draft' | 'published'
    slug?: string
    updatedBy: string
    changeSummary?: string
    publish?: boolean
    draftsEnabled?: boolean
  }): Promise<EntryRow> {
    const locale = patch.locale ?? DEFAULT_LOCALE
    const existing = await this.findById(id, locale)
    if (!existing) throw new NotFoundError(`Entry ${id} (${locale}) not found`)

    let nextSlug = existing.slug
    if (patch.slug !== undefined && patch.slug !== existing.slug) {
      nextSlug = await this.resolveUniqueSlug(existing.collection, locale, patch.slug, id)
    }
    const now = new Date()
    const nextVersion = existing.version + 1
    const workingContent = patch.content ?? (
      patch.draftsEnabled && existing.draftContent != null ? existing.draftContent : existing.content
    )

    const localeWhere = and(eq(entryLocales.entryId, id), eq(entryLocales.locale, locale))

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
          id: nanoid(), entryId: id, locale, version: nextVersion, content: workingContent,
          authorId: patch.updatedBy, changeSummary: patch.changeSummary ?? null, createdAt: now,
        }),
        this.db.update(entryLocales).set(next).where(localeWhere),
        this.db.update(entries).set({ updatedAt: now }).where(eq(entries.id, id)),
      ])
      return {
        ...existing,
        slug: next.slug,
        status: next.status,
        version: next.version,
        content: next.content,
        draftContent: next.draftContent ?? null,
        hasUnpublishedChanges: next.draftContent != null,
        publishedAt: next.publishedAt,
        updatedAt: next.updatedAt,
        updatedBy: next.updatedBy,
      }
    }

    const nextContent = patch.content ?? existing.content
    const nextStatus = patch.status ?? existing.status
    const nextPublishedAt = nextStatus === 'published' && !existing.publishedAt ? now : existing.publishedAt
    await this.db.batch([
      this.db.insert(entryRevisions).values({
        id: nanoid(), entryId: id, locale, version: nextVersion, content: nextContent,
        authorId: patch.updatedBy, changeSummary: patch.changeSummary ?? null, createdAt: now,
      }),
      this.db.update(entryLocales).set({
        content: nextContent,
        slug: nextSlug,
        status: nextStatus,
        version: nextVersion,
        publishedAt: nextPublishedAt,
        updatedAt: now,
        updatedBy: patch.updatedBy,
      }).where(localeWhere),
      this.db.update(entries).set({ updatedAt: now }).where(eq(entries.id, id)),
    ])
    return {
      ...existing,
      content: nextContent,
      slug: nextSlug,
      status: nextStatus,
      version: nextVersion,
      publishedAt: nextPublishedAt,
      updatedAt: now,
      updatedBy: patch.updatedBy,
      hasUnpublishedChanges: false,
    }
  }

  async publish(id: string, updatedBy: string, locale: string = DEFAULT_LOCALE): Promise<EntryRow> {
    return this.updateWithRevision(id, { publish: true, draftsEnabled: true, updatedBy, locale })
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(entries).where(eq(entries.id, id))
  }

  /** Delete only one locale of an entry; the entry shell remains if other locales exist. */
  async deleteLocale(id: string, locale: string): Promise<void> {
    await this.db.delete(entryLocales).where(and(
      eq(entryLocales.entryId, id),
      eq(entryLocales.locale, locale),
    ))
    // Also remove revisions for that locale; entries cascade is broader than we want here.
    await this.db.delete(entryRevisions).where(and(
      eq(entryRevisions.entryId, id),
      eq(entryRevisions.locale, locale),
    ))
  }
}
