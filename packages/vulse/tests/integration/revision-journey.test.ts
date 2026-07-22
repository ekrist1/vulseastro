import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { RevisionsRepo } from '../../src/core/repos/revisions'

describe('block content through revisions', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('preserves block tree through edit → restore cycle', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    const revs = new RevisionsRepo(db)

    const v1Content = { title: 'a', slug: 'a', body: [{ type: 'paragraph', text: 'v1', id: 'p1' }] }
    const e = await entries.create({ collection: 'page', slug: 'a', content: v1Content, createdBy: 'u' })

    await entries.updateWithRevision(e.id, {
      content: { ...v1Content, body: [{ type: 'paragraph', text: 'v2', id: 'p1' }] },
      updatedBy: 'u',
    })
    await entries.updateWithRevision(e.id, {
      content: { ...v1Content, body: [{ type: 'paragraph', text: 'v3', id: 'p1' }] },
      updatedBy: 'u',
    })

    await revs.restore(e.id, 1, { userId: 'u' })

    const current = await entries.findById(e.id)
    expect((current?.content as { body: { text: string }[] }).body[0].text).toBe('v1')
    expect(current?.version).toBe(4)

    const history = await revs.listByEntry(e.id)
    expect(history.map((r) => r.version)).toEqual([4, 3, 2, 1])
  })
})
