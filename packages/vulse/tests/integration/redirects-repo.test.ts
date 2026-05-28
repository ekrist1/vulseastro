import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { RedirectsRepo, normalizePath, loadRedirectsSnapshot, invalidateRedirectsCache } from '../../src/core/repos/redirects'

describe('RedirectsRepo', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB)
    invalidateRedirectsCache()
  })

  it('normalizes paths consistently', () => {
    expect(normalizePath('/Foo/')).toBe('/foo')
    expect(normalizePath('bar')).toBe('/bar')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('/A/B/')).toBe('/a/b')
  })

  it('creates a redirect and finds it by path (case-insensitive)', async () => {
    const repo = new RedirectsRepo(createDb(env.DB))
    const row = await repo.create({ fromPath: '/Old-Page', toUrl: '/new-page' })
    expect(row.id).toBeTruthy()
    expect(row.fromPath).toBe('/old-page')
    expect(row.status).toBe(301)
    expect(row.enabled).toBe(true)

    const found = await repo.findByPath('/OLD-PAGE')
    expect(found?.id).toBe(row.id)

    const trailing = await repo.findByPath('/old-page/')
    expect(trailing?.id).toBe(row.id)
  })

  it('rejects duplicate from_path at the DB level via unique index', async () => {
    const repo = new RedirectsRepo(createDb(env.DB))
    await repo.create({ fromPath: '/a', toUrl: '/b' })
    await expect(repo.create({ fromPath: '/A', toUrl: '/c' })).rejects.toThrow()
  })

  it('updates fields and bumps updatedAt', async () => {
    const repo = new RedirectsRepo(createDb(env.DB))
    const row = await repo.create({ fromPath: '/x', toUrl: '/y' })
    await new Promise((r) => setTimeout(r, 5))
    const updated = await repo.update(row.id, { toUrl: 'https://example.com', status: 302, enabled: false })
    expect(updated?.toUrl).toBe('https://example.com')
    expect(updated?.status).toBe(302)
    expect(updated?.enabled).toBe(false)
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime())
  })

  it('recordHit increments hits and sets lastHitAt', async () => {
    const repo = new RedirectsRepo(createDb(env.DB))
    const row = await repo.create({ fromPath: '/p', toUrl: '/q' })
    await repo.recordHit(row.id)
    await repo.recordHit(row.id)
    const after = await repo.findById(row.id)
    expect(after?.hits).toBe(2)
    expect(after?.lastHitAt).not.toBeNull()
  })

  it('delete removes the row and reports it', async () => {
    const repo = new RedirectsRepo(createDb(env.DB))
    const row = await repo.create({ fromPath: '/gone', toUrl: '/here' })
    expect(await repo.delete(row.id)).toBe(true)
    expect(await repo.findById(row.id)).toBeNull()
    expect(await repo.delete(row.id)).toBe(false)
  })

  it('snapshot cache returns only enabled rules and refreshes on write', async () => {
    const db = createDb(env.DB)
    const repo = new RedirectsRepo(db)

    expect((await loadRedirectsSnapshot(db)).size).toBe(0)

    const r1 = await repo.create({ fromPath: '/a', toUrl: '/aa' })
    const r2 = await repo.create({ fromPath: '/b', toUrl: '/bb', enabled: false })

    const snap = await loadRedirectsSnapshot(db)
    expect(snap.size).toBe(1)
    expect(snap.get('/a')?.id).toBe(r1.id)
    expect(snap.get('/b')).toBeUndefined()

    await repo.update(r2.id, { enabled: true })
    const snap2 = await loadRedirectsSnapshot(db)
    expect(snap2.size).toBe(2)

    await repo.delete(r1.id)
    const snap3 = await loadRedirectsSnapshot(db)
    expect(snap3.size).toBe(1)
    expect(snap3.has('/a')).toBe(false)
  })

  it('lists all redirects', async () => {
    const repo = new RedirectsRepo(createDb(env.DB))
    await repo.create({ fromPath: '/one', toUrl: '/1' })
    await repo.create({ fromPath: '/two', toUrl: '/2' })
    const rows = await repo.list()
    expect(rows.length).toBe(2)
  })
})
