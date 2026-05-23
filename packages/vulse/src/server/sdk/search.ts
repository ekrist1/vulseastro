import type { VulseDb } from '../../core/db.js'

export interface SearchResult {
  entryId: string
  collection: string
  slug: string
  title: string
  snippet: string
}

export interface SearchOptions {
  collections?: string[]
  limit?: number
  includeDrafts?: boolean
}

function safeCollection(name: string): string {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error(`Invalid collection: ${name}`)
  return name
}

export function searchSdk(db: VulseDb) {
  const d1 = db.$client

  return {
    query: async (query: string, opts: SearchOptions = {}): Promise<SearchResult[]> => {
      const limit = opts.limit ?? 20
      const safeQuery = query.replace(/"/g, '""').trim()
      if (!safeQuery) return []

      const parts = [
        `SELECT f.entry_id, f.collection, f.slug, f.title,`,
        `snippet(vulse_entries_fts, 4, '<mark>', '</mark>', '…', 8) AS snippet`,
        `FROM vulse_entries_fts f`,
        `INNER JOIN vulse_entries e ON e.id = f.entry_id`,
        `WHERE vulse_entries_fts MATCH '${safeQuery}*'`,
      ]

      if (!opts.includeDrafts) parts.push(`AND e.status = 'published'`)

      if (opts.collections && opts.collections.length > 0) {
        const list = opts.collections.map((c) => `'${safeCollection(c)}'`).join(', ')
        parts.push(`AND f.collection IN (${list})`)
      }

      parts.push(`LIMIT ${Math.max(1, Math.min(limit, 100))}`)

      const { results } = await d1.prepare(parts.join(' ')).all<{
        entry_id: string
        collection: string
        slug: string
        title: string | null
        snippet: string
      }>()

      return results.map((r) => ({
        entryId: r.entry_id,
        collection: r.collection,
        slug: r.slug,
        title: r.title ?? r.slug,
        snippet: r.snippet,
      }))
    },
  }
}
