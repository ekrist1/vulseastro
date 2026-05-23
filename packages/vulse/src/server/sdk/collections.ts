import type { VulseDb } from '../../core/db.js'
import { EntriesRepo, type EntryOrderBy, type EntryRow } from '../../core/repos/entries.js'
import { evaluate } from '../../core/access.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import type { AuthContext } from '../../core/blueprints/types.js'

export interface CollectionSdkOptions {
  audience?: AuthContext['user'] | null
  includeDrafts?: boolean
}

export interface CollectionFindOptions extends CollectionSdkOptions {
  limit?: number
  offset?: number
  createdBy?: string
  /** ISO date string or Date */
  publishedAfter?: Date | string
  publishedBefore?: Date | string
  orderBy?: EntryOrderBy
  order?: 'asc' | 'desc'
}

function parseDate(v: Date | string | undefined): Date | undefined {
  if (v === undefined) return undefined
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function collectionsSdk(db: VulseDb, reg: BlueprintRegistry) {
  const entries = new EntriesRepo(db)

  async function gatedRows(
    name: string,
    audience: AuthContext['user'] | null,
    listOpts: Omit<Parameters<EntriesRepo['list']>[0], 'collection' | 'status'>,
    status?: 'draft' | 'published',
  ): Promise<EntryRow[]> {
    const bp = reg.get(name)
    if (!bp) throw new Error(`Unknown collection: ${name}`)
    const rows = await entries.list({ collection: name, ...(status ? { status } : {}), ...listOpts })
    const out: EntryRow[] = []
    for (const r of rows) {
      const allowed = await evaluate(bp, 'read', {
        user: audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      if (allowed) out.push(r)
    }
    return out
  }

  return {
    find: async (collection: string, opts: CollectionFindOptions = {}) => {
      const status = opts.includeDrafts ? undefined : 'published'
      const publishedAfter = parseDate(opts.publishedAfter)
      const publishedBefore = parseDate(opts.publishedBefore)
      return gatedRows(collection, opts.audience ?? null, {
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
        ...(opts.createdBy !== undefined ? { createdBy: opts.createdBy } : {}),
        ...(publishedAfter !== undefined ? { publishedAfter } : {}),
        ...(publishedBefore !== undefined ? { publishedBefore } : {}),
        ...(opts.orderBy !== undefined ? { orderBy: opts.orderBy } : {}),
        ...(opts.order !== undefined ? { order: opts.order } : {}),
      }, status)
    },
    findById: async (collection: string, id: string, opts: CollectionSdkOptions = {}) => {
      const bp = reg.get(collection)
      if (!bp) throw new Error(`Unknown collection: ${collection}`)
      const r = await entries.findById(id)
      if (!r) return null
      const allowed = await evaluate(bp, 'read', {
        user: opts.audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      return allowed ? r : null
    },
    findBySlug: async (collection: string, slug: string, opts: CollectionSdkOptions = {}) => {
      const bp = reg.get(collection)
      if (!bp) throw new Error(`Unknown collection: ${collection}`)
      const r = await entries.findBySlug(collection, slug)
      if (!r) return null
      const allowed = await evaluate(bp, 'read', {
        user: opts.audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      return allowed ? r : null
    },
  }
}
