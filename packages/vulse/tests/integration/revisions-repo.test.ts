import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { RevisionsRepo } from '../../src/core/repos/revisions'

describe('revision write path', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('every update writes a revision row in the same tx', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    const revs = new RevisionsRepo(db)

    const e = await entries.create({ collection: 'post', slug: 'r', content: { t: 1 }, createdBy: 'u1' })
    await entries.updateWithRevision(e.id, { content: { t: 2 }, updatedBy: 'u1', changeSummary: 'bump' })
    await entries.updateWithRevision(e.id, { content: { t: 3 }, updatedBy: 'u1' })

    const history = await revs.listByEntry(e.id)
    expect(history.map((r) => r.version)).toEqual([3, 2, 1])
  })

  it('restoring a revision creates a new version on top, no destruction', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    const revs = new RevisionsRepo(db)

    const e = await entries.create({ collection: 'post', slug: 'r2', content: { t: 1 }, createdBy: 'u1' })
    await entries.updateWithRevision(e.id, { content: { t: 2 }, updatedBy: 'u1' })
    await revs.restore(e.id, 1, { userId: 'u1' })

    const current = await entries.findById(e.id)
    expect(current?.content).toEqual({ t: 1 })
    expect(current?.version).toBe(3)
    expect((await revs.listByEntry(e.id)).length).toBe(3)
  })
})
