import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'

describe('applyMigrations', () => {
  it('creates all vulse tables in a fresh D1', async () => {
    await applyMigrations(env.DB)
    const rows = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'vulse_%'`
    ).all<{ name: string }>()
    const names = rows.results.map((r) => r.name).sort()
    const core = names.filter((n) => !/_fts_(config|content|data|docsize|idx)$/.test(n))
    expect(core).toEqual([
      'vulse_collections',
      'vulse_entries',
      'vulse_entries_fts',
      'vulse_entry_revisions',
      'vulse_media',
      'vulse_sets',
      'vulse_settings',
    ])
  })

  it('is idempotent on second run', async () => {
    await applyMigrations(env.DB)
    await expect(applyMigrations(env.DB)).resolves.not.toThrow()
  })
})
