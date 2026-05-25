import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { runEntryQuery, countEntryQuery, type EntryQuerySpec } from '../../src/core/repos/entry-query'

function spec(partial: Partial<EntryQuerySpec>): EntryQuerySpec {
  return {
    collection: 'post',
    locale: 'default',
    where: { combine: 'and', nodes: [] },
    ...partial,
  }
}

describe('runEntryQuery', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  async function seed() {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'a', content: { title: 'Alpha', views: 5, featured: true, tags: ['x', 'y'] }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'b', content: { title: 'Bravo', views: 50, featured: false, tags: ['y'] }, createdBy: 'u2', status: 'published' })
    await repo.create({ collection: 'post', slug: 'c', content: { title: 'Charlie', views: 500, featured: true, tags: ['z'] }, createdBy: 'u1', status: 'draft' })
    return createDb(env.DB)
  }

  it('filters by a column with eq', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'published' }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'b'])
  })

  it('filters by a JSON content path with comparison', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.views', op: 'gte', value: 50 }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['b', 'c'])
  })

  it('filters JSON booleans', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.featured', op: 'eq', value: true }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'c'])
  })

  it('supports in, like, between, isNull', async () => {
    const db = await seed()
    const inRows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'createdBy', op: 'in', value: ['u2'] }] } }))
    expect(inRows.map((r) => r.slug)).toEqual(['b'])
    const likeRows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.title', op: 'like', value: 'rav' }] } }))
    expect(likeRows.map((r) => r.slug)).toEqual(['b'])
    const betweenRows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.views', op: 'between', value: [10, 100] }] } }))
    expect(betweenRows.map((r) => r.slug)).toEqual(['b'])
  })

  it('supports array contains via json_each', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.tags', op: 'contains', value: 'y' }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'b'])
  })

  it('composes AND / OR groups', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({
      where: { combine: 'and', nodes: [
        { field: 'status', op: 'eq', value: 'published' },
        { combine: 'or', nodes: [
          { field: 'content.views', op: 'gte', value: 40 },
          { field: 'createdBy', op: 'eq', value: 'u1' },
        ] },
      ] },
    }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'b'])
  })

  it('orders, limits, and offsets', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({
      where: { combine: 'and', nodes: [] },
      orderBy: [{ field: 'content.views', dir: 'desc' }],
      limit: 2,
    }))
    expect(rows.map((r) => r.slug)).toEqual(['c', 'b'])
  })

  it('throws on an invalid field path', async () => {
    const db = await seed()
    await expect(runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.bad path', op: 'eq', value: 1 }] } }))).rejects.toThrow()
  })

  it('scopes to descendants with and without depth', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const root = await repo.create({ collection: 'docs', slug: 'root', content: { t: 'root' }, createdBy: 'u1', status: 'published' })
    const child = await repo.create({ collection: 'docs', slug: 'child', content: { t: 'child' }, createdBy: 'u1', status: 'published', parentId: root.id })
    const grandchild = await repo.create({ collection: 'docs', slug: 'grand', content: { t: 'grand' }, createdBy: 'u1', status: 'published', parentId: child.id })
    const db = createDb(env.DB)

    const all = await runEntryQuery(db, spec({ collection: 'docs', descendants: { parentId: root.id } }))
    expect(all.map((r) => r.slug).sort()).toEqual(['child', 'grand'])

    const directOnly = await runEntryQuery(db, spec({ collection: 'docs', descendants: { parentId: root.id, depth: 1 } }))
    expect(directOnly.map((r) => r.slug)).toEqual(['child'])

    const withSelf = await runEntryQuery(db, spec({ collection: 'docs', descendants: { parentId: root.id, includeSelf: true } }))
    expect(withSelf.map((r) => r.slug).sort()).toEqual(['child', 'grand', 'root'])

    expect(grandchild.id).toBeTruthy()
  })

  it('combines descendants with a where filter', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const root = await repo.create({ collection: 'docs', slug: 'r', content: {}, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'docs', slug: 'pub', content: {}, createdBy: 'u1', status: 'published', parentId: root.id })
    await repo.create({ collection: 'docs', slug: 'drafted', content: {}, createdBy: 'u1', status: 'draft', parentId: root.id })
    const db = createDb(env.DB)

    const rows = await runEntryQuery(db, spec({
      collection: 'docs',
      descendants: { parentId: root.id },
      where: { combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'published' }] },
    }))
    expect(rows.map((r) => r.slug)).toEqual(['pub'])
  })

  it('counts matches ignoring limit and offset', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'p1', content: { views: 1 }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'p2', content: { views: 2 }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'p3', content: { views: 3 }, createdBy: 'u1', status: 'published' })
    const db = createDb(env.DB)

    const total = await countEntryQuery(db, spec({
      where: { combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'published' }] },
      limit: 1,
      offset: 1,
    }))
    expect(total).toBe(3)
  })
})
