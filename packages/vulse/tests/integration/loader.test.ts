import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { vulseLoader } from '../../src/server/loader'

describe('vulseLoader', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('yields only published entries by default', async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)
    await repo.create({ collection: 'post', slug: 'draft', content: { title: 'D', slug: 'draft', body: [] }, createdBy: 'u' })
    await repo.create({ collection: 'post', slug: 'live', content: { title: 'L', slug: 'live', body: [] }, createdBy: 'u', status: 'published' })

    const items = await runLoader('post', { dbBinding: env.DB })
    expect(items.map((i) => i.slug)).toEqual(['live'])
  })

  it('includes drafts when previewToken matches', async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)
    await repo.create({ collection: 'post', slug: 'draft', content: { title: 'D', slug: 'draft', body: [] }, createdBy: 'u' })
    const items = await runLoader('post', { dbBinding: env.DB, includeDrafts: true })
    expect(items.length).toBe(1)
  })
})

async function runLoader(collection: string, opts: { dbBinding: D1Database; includeDrafts?: boolean }) {
  const loader = vulseLoader({ collection })
  const collected: Array<{ id: string; data: { slug: string; status: string } }> = []
  const ctx = {
    store: {
      set: async (entry: { id: string; data: { slug: string; status: string } }) => { collected.push(entry) },
      clear: () => { collected.length = 0 },
    },
    meta: { get: () => undefined, set: () => {} },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    parseData: async (e: { data: unknown }) => e.data,
    generateDigest: (s: string) => s,
    config: {} as Record<string, unknown>,
    entryTypes: {} as Record<string, unknown>,
    refreshContextData: undefined,
    _vulseTestBinding: opts.dbBinding,
    _vulseIncludeDrafts: opts.includeDrafts ?? false,
  }
  await loader.load!(ctx as Parameters<NonNullable<typeof loader.load>>[0])
  return collected.map((e) => ({ id: e.id, slug: e.data.slug, status: e.data.status }))
}
