import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EntryRow } from '../../src/core/repos/entries.js'

const find = vi.fn()
const findBySlug = vi.fn()
const getSession = vi.fn()

vi.mock('../../src/server/env.js', () => ({
  getRuntimeEnv: () => ({ DB: {}, BUCKET: {}, BETTER_AUTH_SECRET: 'secret' }),
}))

vi.mock('../../src/core/db.js', () => ({
  createDb: () => ({}),
}))

vi.mock('../../src/core/blueprints/load.js', () => ({
  registryForRequest: vi.fn(async () => ({ get: vi.fn() })),
}))

vi.mock('../../src/server/runtime.js', () => ({
  getRuntime: vi.fn(async () => ({
    auth: { api: { getSession } },
    sdk: { collections: { find, findBySlug } },
  })),
}))

const astro = {
  request: new Request('https://example.com/post/hello'),
  url: new URL('https://example.com/post/hello'),
  locals: {},
}

const entry: EntryRow = {
  id: 'e1',
  collection: 'post',
  parentId: null,
  sortOrder: 0,
  slug: 'hello',
  status: 'published',
  locale: 'default',
  version: 1,
  content: { title: 'Published' },
  draftContent: { title: 'Draft' },
  hasUnpublishedChanges: false,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
}

describe('useCollection', () => {
  beforeEach(() => {
    find.mockReset()
    findBySlug.mockReset()
    getSession.mockReset()
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'member', email: 'a@b.c' } })
  })

  it('lists entries with session audience and find options', async () => {
    find.mockResolvedValue([entry])
    const { useCollection } = await import('../../src/server/use-collection.js')

    const result = await useCollection(astro, 'post', {
      orderBy: 'publishedAt',
      order: 'desc',
      limit: 10,
    })

    expect(find).toHaveBeenCalledWith('post', {
      orderBy: 'publishedAt',
      order: 'desc',
      limit: 10,
      audience: { id: 'u1', role: 'member', email: 'a@b.c' },
    })
    expect(result.entries).toEqual([entry])
  })

  it('finds by slug and resolves preview content by default', async () => {
    findBySlug.mockResolvedValue(entry)
    const { useCollection } = await import('../../src/server/use-collection.js')

    const result = await useCollection(astro, 'post', { slug: 'hello' })

    expect(findBySlug).toHaveBeenCalledWith('post', 'hello', {
      audience: { id: 'u1', role: 'member', email: 'a@b.c' },
    })
    expect(result.entry).toEqual(entry)
    expect(result.content).toEqual({ title: 'Published' })
  })

  it('returns draft content when preview cookie is set', async () => {
    findBySlug.mockResolvedValue(entry)
    const { useCollection } = await import('../../src/server/use-collection.js')

    const result = await useCollection(
      { ...astro, locals: { vulsePreview: true } },
      'post',
      { slug: 'hello' },
    )

    expect(result.content).toEqual({ title: 'Draft' })
  })

  it('allows explicit audience override', async () => {
    find.mockResolvedValue([])
    const { useCollection } = await import('../../src/server/use-collection.js')

    await useCollection(astro, 'post', { audience: null })

    expect(find).toHaveBeenCalledWith('post', { audience: null })
  })

  it('skips preview resolution when preview is false', async () => {
    findBySlug.mockResolvedValue(entry)
    const { useCollection } = await import('../../src/server/use-collection.js')

    const result = await useCollection(
      { ...astro, locals: { vulsePreview: true } },
      'post',
      { slug: 'hello', preview: false },
    )

    expect(result.content).toEqual({ title: 'Published' })
  })
})
