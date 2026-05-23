import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { searchSdk } from '../../src/server/sdk/search'

describe('search', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('finds entries by title', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    await entries.create({ collection: 'post', slug: 'a', content: { title: 'Astro is great', body: '' }, createdBy: 'u', status: 'published' })
    await entries.create({ collection: 'post', slug: 'b', content: { title: 'Cloudflare workers', body: '' }, createdBy: 'u', status: 'published' })

    const results = await searchSdk(db).query('astro')
    expect(results.length).toBe(1)
    expect(results[0].slug).toBe('a')
  })

  it('filters by collection', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    await entries.create({ collection: 'post', slug: 'x', content: { title: 'foo', body: '' }, createdBy: 'u', status: 'published' })
    await entries.create({ collection: 'page', slug: 'y', content: { title: 'foo', body: '' }, createdBy: 'u', status: 'published' })

    const onlyPosts = await searchSdk(db).query('foo', { collections: ['post'] })
    expect(onlyPosts.length).toBe(1)
    expect(onlyPosts[0].collection).toBe('post')
  })
})
