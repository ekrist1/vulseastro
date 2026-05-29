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
      'vulse_entry_locales',
      'vulse_entry_revisions',
      'vulse_form_rate_limits',
      'vulse_form_submissions',
      'vulse_form_unique_values',
      'vulse_form_upload_drafts',
      'vulse_forms',
      'vulse_global_sets',
      'vulse_global_values',
      'vulse_media',
      'vulse_preview_sessions',
      'vulse_redirects',
      'vulse_sets',
      'vulse_settings',
    ])
  })

  it('creates the better-auth two-factor table and column', async () => {
    await applyMigrations(env.DB)
    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = 'twoFactor'`
    ).all<{ name: string }>()
    expect(tables.results.map((r) => r.name)).toEqual(['twoFactor'])
    const cols = await env.DB.prepare(`PRAGMA table_info(user)`).all<{ name: string }>()
    expect(cols.results.map((c) => c.name)).toContain('two_factor_enabled')
  })

  it('is idempotent on second run', async () => {
    await applyMigrations(env.DB)
    await expect(applyMigrations(env.DB)).resolves.not.toThrow()
  })
})
