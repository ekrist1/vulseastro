import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { collectionsSdk } from '../../src/server/sdk/collections'

describe('collectionsSdk filtering', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('filters by author, date, and paginates', async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)
    const reg = new BlueprintRegistry()
    reg.register(defineCollection({
      name: 'post',
      label: 'Post',
      schema: z.object({ title: z.string(), slug: z.string() }),
      admin: { titleField: 'title' },
      access: { read: ({ entry }) => entry?.status === 'published' },
    }))

    const sdk = collectionsSdk(db, reg)

    await repo.create({
      collection: 'post',
      slug: 'old',
      content: { title: 'Old', slug: 'old' },
      createdBy: 'author-a',
      status: 'published',
    })
    await repo.create({
      collection: 'post',
      slug: 'new',
      content: { title: 'New', slug: 'new' },
      createdBy: 'author-a',
      status: 'published',
    })
    await repo.create({
      collection: 'post',
      slug: 'other',
      content: { title: 'Other', slug: 'other' },
      createdBy: 'author-b',
      status: 'published',
    })
    await repo.create({
      collection: 'post',
      slug: 'draft',
      content: { title: 'Draft', slug: 'draft' },
      createdBy: 'author-a',
    })

    const byAuthor = await sdk.find('post', { createdBy: 'author-a' })
    expect(byAuthor.map((e) => e.slug).sort()).toEqual(['new', 'old'])

    const paged = await sdk.find('post', {
      createdBy: 'author-a',
      orderBy: 'updatedAt',
      order: 'desc',
      limit: 1,
    })
    expect(paged).toHaveLength(1)
    expect(paged[0]!.slug).toBe('new')

    const all = await sdk.find('post')
    expect(all).toHaveLength(3)
  })
})

describe('EntriesRepo.list filters', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('orders by publishedAt descending', async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)

    await repo.create({
      collection: 'post',
      slug: 'first',
      content: { title: 'First', slug: 'first' },
      status: 'published',
    })
    await new Promise((r) => setTimeout(r, 5))
    await repo.create({
      collection: 'post',
      slug: 'second',
      content: { title: 'Second', slug: 'second' },
      status: 'published',
    })

    const rows = await repo.list({
      collection: 'post',
      status: 'published',
      orderBy: 'publishedAt',
      order: 'desc',
    })
    expect(rows.map((r) => r.slug)).toEqual(['second', 'first'])
  })
})
