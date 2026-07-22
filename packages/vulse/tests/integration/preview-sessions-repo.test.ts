import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { PreviewSessionsRepo } from '../../src/core/repos/preview-sessions'

describe('PreviewSessionsRepo', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('creates and finds a session', async () => {
    const repo = new PreviewSessionsRepo(createDb(env.DB))
    const row = await repo.create({
      userId: 'u1',
      collection: 'page',
      slug: 'about',
      content: { title: 'About', body: [] },
      entryId: 'e1',
    })
    expect(row.id).toBeTruthy()
    const found = await repo.findById(row.id)
    expect(found?.slug).toBe('about')
    expect(found?.content).toEqual({ title: 'About', body: [] })
  })

  it('purges expired sessions', async () => {
    const repo = new PreviewSessionsRepo(createDb(env.DB))
    const row = await repo.create({
      userId: 'u1',
      collection: 'page',
      slug: 'old',
      content: { title: 'Old' },
      ttlMs: -1000,
    })
    const purged = await repo.purgeExpired(new Date())
    expect(purged).toBe(1)
    expect(await repo.findById(row.id)).toBeNull()
  })
})
