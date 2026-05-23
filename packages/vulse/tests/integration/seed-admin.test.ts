import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { seedAdminUser } from '../../src/cli/seed-admin'

describe('seedAdminUser', () => {
  it('inserts an admin user and returns the temp password', async () => {
    await applyMigrations(env.DB)
    const result = await seedAdminUser(env.DB, { email: 'admin@example.com' })
    expect(result.email).toBe('admin@example.com')
    expect(result.tempPassword).toMatch(/.{12,}/)

    const row = await env.DB.prepare(`SELECT role FROM user WHERE email = ?`)
      .bind('admin@example.com').first<{ role: string }>()
    expect(row?.role).toBe('admin')
  })

  it('refuses to create a duplicate', async () => {
    await applyMigrations(env.DB)
    await seedAdminUser(env.DB, { email: 'admin@example.com' })
    await expect(seedAdminUser(env.DB, { email: 'admin@example.com' })).rejects.toThrow(/exists/)
  })
})
