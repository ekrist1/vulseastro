import type { VulseDb } from '../../core/db.js'
import { EntriesRepo } from '../../core/repos/entries.js'
import { evaluate } from '../../core/access.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import type { AuthContext } from '../../core/blueprints/types.js'

export interface CollectionSdkOptions {
  audience?: AuthContext['user'] | null
  includeDrafts?: boolean
}

export function collectionsSdk(db: VulseDb, reg: BlueprintRegistry) {
  const entries = new EntriesRepo(db)

  async function gatedRows(
    name: string,
    audience: AuthContext['user'] | null,
    status?: 'draft' | 'published',
  ) {
    const bp = reg.get(name)
    if (!bp) throw new Error(`Unknown collection: ${name}`)
    const rows = await entries.list({ collection: name, ...(status ? { status } : {}) })
    const out = []
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
    find: async (collection: string, opts: CollectionSdkOptions = {}) => {
      const status = opts.includeDrafts ? undefined : 'published'
      return gatedRows(collection, opts.audience ?? null, status)
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
