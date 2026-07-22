import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { MediaRepo } from '../../src/core/repos/media'
import { vulseScheduled } from '../../src/server/cron'

describe('cron purge', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('hard-deletes media rows + R2 objects past the retention window', async () => {
    const db = createDb(env.DB)
    const repo = new MediaRepo(db)
    const m = await repo.create({ r2Key: 'k', mime: 'image/png', size: 1, uploadedBy: 'u' })
    await env.BUCKET.put(m.r2Key, 'x')
    await repo.softDelete(m.id)
    await env.DB.prepare(`UPDATE vulse_media SET deleted_at = ? WHERE id = ?`)
      .bind(Date.now() - 10 * 86_400_000, m.id).run()

    await vulseScheduled({
      DB: env.DB,
      BUCKET: env.BUCKET,
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    })

    expect(await repo.findById(m.id)).toBeNull()
    expect(await env.BUCKET.get(m.r2Key)).toBeNull()
  })
})
