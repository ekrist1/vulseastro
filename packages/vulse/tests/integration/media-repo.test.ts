import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { MediaRepo } from '../../src/core/repos/media'

describe('MediaRepo', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('records and lists media', async () => {
    const repo = new MediaRepo(createDb(env.DB))
    const m = await repo.create({ r2Key: 'k1', mime: 'image/jpeg', size: 1234, width: 800, height: 600, uploadedBy: 'u' })
    expect(m.id).toBeTruthy()
    const list = await repo.list({})
    expect(list.length).toBe(1)
  })

  it('soft-deletes', async () => {
    const repo = new MediaRepo(createDb(env.DB))
    const m = await repo.create({ r2Key: 'k', mime: 'image/png', size: 1, uploadedBy: 'u' })
    await repo.softDelete(m.id)
    const list = await repo.list({})
    expect(list.length).toBe(0)
    const all = await repo.list({ includeDeleted: true })
    expect(all.length).toBe(1)
  })

  it('lists rows older than N days that are soft-deleted', async () => {
    const repo = new MediaRepo(createDb(env.DB))
    const m = await repo.create({ r2Key: 'k', mime: 'image/png', size: 1, uploadedBy: 'u' })
    await repo.softDelete(m.id)
    await env.DB.prepare(`UPDATE vulse_media SET deleted_at = ? WHERE id = ?`)
      .bind(Date.now() - 8 * 86_400_000, m.id).run()
    const purgeable = await repo.listPurgeable(7)
    expect(purgeable.length).toBe(1)
  })
})
