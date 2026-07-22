import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { CollectionQuery } from '../../src/server/sdk/query'
import { createSdk } from '../../src/server/sdk/index'

function registry() {
  const reg = new BlueprintRegistry()
  reg.register(defineCollection({
    name: 'post',
    label: 'Post',
    schema: z.object({ title: z.string(), views: z.number().optional() }),
    admin: { titleField: 'title' },
    access: { read: ({ entry }) => entry?.status === 'published' },
  }))
  return reg
}

function relRegistry() {
  const reg = new BlueprintRegistry()
  reg.register(defineCollection({
    name: 'author',
    label: 'Author',
    schema: z.object({ name: z.string() }),
    admin: { titleField: 'name' },
  }))
  reg.register(defineCollection({
    name: 'post',
    label: 'Post',
    schema: z.object({
      title: z.string(),
      author: z.ref('author'),
      tags: z.entries(['author']).optional(),
    }),
    admin: { titleField: 'title' },
  }))
  return reg
}

async function seed() {
  const repo = new EntriesRepo(createDb(env.DB))
  for (let i = 1; i <= 5; i++) {
    await repo.create({ collection: 'post', slug: `p${i}`, content: { title: `P${i}`, views: i * 10 }, createdBy: 'u1', status: 'published' })
  }
}

describe('CollectionQuery terminals', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('all() returns matching rows', async () => {
    await seed()
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    const rows = await q.where('content.views', '>=', 30).all()
    expect(rows.map((r) => r.slug).sort()).toEqual(['p3', 'p4', 'p5'])
  })

  it('first() returns one row or null', async () => {
    await seed()
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    const row = await q.orderBy('content.views', 'desc').first()
    expect(row?.slug).toBe('p5')
    const none = await new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
      .where('content.views', '>=', 9999).first()
    expect(none).toBeNull()
  })

  it('count() and exists()', async () => {
    await seed()
    const base = () => new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    expect(await base().count()).toBe(5)
    expect(await base().where('content.views', '>=', 40).count()).toBe(2)
    expect(await base().where('content.views', '>=', 9999).exists()).toBe(false)
  })

  it('paginate() returns rows and total', async () => {
    await seed()
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    const page = await q.orderBy('content.views', 'asc').paginate({ page: 2, perPage: 2 })
    expect(page.rows.map((r) => r.slug)).toEqual(['p3', 'p4'])
    expect(page.total).toBe(5)
    expect(page.pageCount).toBe(3)
  })

  it('forAudience drops rows the audience cannot read; count stays pre-gate', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'pub', content: { title: 'Pub' }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'draft', content: { title: 'Draft' }, createdBy: 'u1', status: 'draft' })

    const q = new CollectionQuery(createDb(env.DB), registry(), 'post')
      .locale('default')
      .where('status', 'in', ['draft', 'published'])
      .forAudience(null)

    const rows = await q.all()
    expect(rows.map((r) => r.slug)).toEqual(['pub'])

    const countQ = new CollectionQuery(createDb(env.DB), registry(), 'post')
      .locale('default')
      .where('status', 'in', ['draft', 'published'])
      .forAudience(null)
    expect(await countQ.count()).toBe(2)
  })

  it('include resolves a single relation and an array relation into row.relations', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a1 = await repo.create({ collection: 'author', slug: 'a1', content: { name: 'Ann' }, createdBy: 'u1', status: 'published' })
    const a2 = await repo.create({ collection: 'author', slug: 'a2', content: { name: 'Bob' }, createdBy: 'u1', status: 'published' })
    await repo.create({
      collection: 'post', slug: 'p1',
      content: { title: 'P1', author: a1.id, tags: [a1.id, a2.id] },
      createdBy: 'u1', status: 'published',
    })

    const q = new CollectionQuery(createDb(env.DB), relRegistry(), 'post').locale('default')
    const rows = await q.include('author').include('tags').all()
    const r = rows[0] as typeof rows[0] & { relations: Record<string, unknown> }

    expect((r.relations.author as { slug: string }).slug).toBe('a1')
    expect((r.relations.tags as { slug: string }[]).map((e) => e.slug)).toEqual(['a1', 'a2'])
  })

  it('include with { as } overrides the attachment key', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a1 = await repo.create({ collection: 'author', slug: 'a1', content: { name: 'Ann' }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'p1', content: { title: 'P1', author: a1.id }, createdBy: 'u1', status: 'published' })

    const q = new CollectionQuery(createDb(env.DB), relRegistry(), 'post').locale('default')
    const rows = await q.include('author', { as: 'writer' }).all()
    const r = rows[0] as typeof rows[0] & { relations: Record<string, unknown> }
    expect((r.relations.writer as { slug: string }).slug).toBe('a1')
  })

  it('include on a non-relation field throws', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'p1', content: { title: 'P1', author: 'x' }, createdBy: 'u1', status: 'published' })
    const q = new CollectionQuery(createDb(env.DB), relRegistry(), 'post').locale('default')
    await expect(q.include('title').all()).rejects.toThrow(/not a relation/i)
  })

  it('is reachable via createSdk().query', async () => {
    await seed()
    const fakeAuth = { api: { getSession: async () => null } } as never
    const sdk = createSdk(createDb(env.DB), fakeAuth, registry(), { accountHash: undefined, token: undefined })
    const rows = await sdk.query('post').where('content.views', '>=', 40).all()
    expect(rows.map((r) => r.slug).sort()).toEqual(['p4', 'p5'])
  })
})
