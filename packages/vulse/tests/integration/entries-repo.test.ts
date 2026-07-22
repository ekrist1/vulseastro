import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'

describe('EntriesRepo', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('creates and reads an entry', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const created = await repo.create({
      collection: 'post', slug: 'hello', content: { title: 'Hello' }, createdBy: 'u1',
    })
    expect(created.id).toBeTruthy()
    expect(created.version).toBe(1)
    const found = await repo.findById(created.id)
    expect(found?.slug).toBe('hello')
  })

  it('lists by collection with filtering', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'a', content: { title: 'A' }, createdBy: 'u1' })
    await repo.create({ collection: 'post', slug: 'b', content: { title: 'B' }, createdBy: 'u1', status: 'published' })
    const all = await repo.list({ collection: 'post' })
    expect(all.length).toBe(2)
    const published = await repo.list({ collection: 'post', status: 'published' })
    expect(published.length).toBe(1)
  })

  it('auto-increments duplicate slug on create', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'dup', content: {}, createdBy: 'u1' })
    const second = await repo.create({ collection: 'post', slug: 'dup', content: {}, createdBy: 'u1' })
    expect(second.slug).toBe('dup-2')
    const third = await repo.create({ collection: 'post', slug: 'dup', content: {}, createdBy: 'u1' })
    expect(third.slug).toBe('dup-3')
  })

  it('updates increments version', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const e = await repo.create({ collection: 'post', slug: 'v', content: { title: 'a' }, createdBy: 'u1' })
    const updated = await repo.updateWithRevision(e.id, { content: { title: 'b' }, updatedBy: 'u1' })
    expect(updated.version).toBe(2)
  })

  it('findManyByIds returns entries for the given ids at a locale', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a = await repo.create({ collection: 'post', slug: 'a', content: { title: 'A' }, createdBy: 'u1' })
    const b = await repo.create({ collection: 'post', slug: 'b', content: { title: 'B' }, createdBy: 'u1' })
    await repo.create({ collection: 'post', slug: 'c', content: { title: 'C' }, createdBy: 'u1' })

    const found = await repo.findManyByIds([a.id, b.id])
    expect(found.map((e) => e.slug).sort()).toEqual(['a', 'b'])
    expect(await repo.findManyByIds([])).toEqual([])
  })

  it('keeps tree parents inside the same collection', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const post = await repo.create({ collection: 'post', slug: 'post-parent', content: {}, createdBy: 'u1' })
    const page = await repo.create({ collection: 'page', slug: 'page-parent', content: {}, createdBy: 'u1' })
    const child = await repo.create({ collection: 'page', slug: 'child', content: {}, createdBy: 'u1', parentId: page.id })

    await expect(repo.create({
      collection: 'page',
      slug: 'bad-child',
      content: {},
      createdBy: 'u1',
      parentId: post.id,
    })).rejects.toThrow(/same collection/)
    await expect(repo.move('page', child.id, { parentId: post.id })).rejects.toThrow(/same collection/)
    await expect(repo.move('page', child.id, { parentId: 'missing' })).rejects.toThrow(/Parent entry not found/)
  })

  it('honors explicit sortOrder direction', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'a', content: {}, createdBy: 'u1' })
    await repo.create({ collection: 'post', slug: 'b', content: {}, createdBy: 'u1' })
    await repo.create({ collection: 'post', slug: 'c', content: {}, createdBy: 'u1' })

    const desc = await repo.list({ collection: 'post', orderBy: 'sortOrder', order: 'desc' })
    expect(desc.map((e) => e.slug)).toEqual(['c', 'b', 'a'])
  })
})
