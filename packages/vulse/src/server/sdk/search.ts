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

function buildMatchExpression(query: string): string {
  // FTS5: quote each token and append * for prefix match. Doubling " escapes it
  // inside the quoted token. Tokens that reduce to empty after stripping non-
  // word characters are dropped.
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, ''))
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
  return tokens.join(' ')
}

export function searchSdk(db: VulseDb) {
  const d1 = db.$client

  return {
    query: async (query: string, opts: SearchOptions = {}): Promise<SearchResult[]> => {
      const limit = Math.max(1, Math.min(opts.limit ?? 20, 100))
      const match = buildMatchExpression(query)
      if (!match) return []

      const parts = [
        `SELECT f.entry_id, f.collection, f.slug, f.title,`,
        `snippet(vulse_entries_fts, 4, '<mark>', '</mark>', '…', 8) AS snippet`,
        `FROM vulse_entries_fts f`,
        `INNER JOIN vulse_entries e ON e.id = f.entry_id`,
        `WHERE vulse_entries_fts MATCH ?`,
      ]
      const binds: unknown[] = [match]

      if (!opts.includeDrafts) parts.push(`AND e.status = 'published'`)

      if (opts.collections && opts.collections.length > 0) {
        const collections = opts.collections.map(safeCollection)
        const placeholders = collections.map(() => '?').join(', ')
        parts.push(`AND f.collection IN (${placeholders})`)
        binds.push(...collections)
      }

      parts.push(`LIMIT ${limit}`)

      const { results } = await d1.prepare(parts.join(' ')).bind(...binds).all<{
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
