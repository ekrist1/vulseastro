import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { seedAdminUser } from '../../src/cli/seed-admin'

const SECRET = 'a'.repeat(32)

describe('seedAdminUser', () => {
  it('inserts an admin user and returns the temp password', async () => {
    await applyMigrations(env.DB)
    const result = await seedAdminUser(env.DB, { email: 'admin@example.com', secret: SECRET })
    expect(result.email).toBe('admin@example.com')
    expect(result.tempPassword).toMatch(/.{12,}/)

    const row = await env.DB.prepare(`SELECT role FROM user WHERE email = ?`)
      .bind('admin@example.com').first<{ role: string }>()
    expect(row?.role).toBe('admin')
  })

  it('seeded admin can sign in via Better Auth', async () => {
    await applyMigrations(env.DB)
    const { email, tempPassword } = await seedAdminUser(env.DB, {
      email: 'login@example.com',
      secret: SECRET,
      baseURL: 'http://localhost',
    })

    const auth = await createAuth(createDb(env.DB), { baseURL: 'http://localhost', secret: SECRET })
    const res = await auth.handler(new Request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ email, password: tempPassword }),
    }))
    expect(res.status).toBe(200)
  })

  it('refuses to create a duplicate', async () => {
    await applyMigrations(env.DB)
    await seedAdminUser(env.DB, { email: 'admin@example.com', secret: SECRET })
    await expect(seedAdminUser(env.DB, { email: 'admin@example.com', secret: SECRET })).rejects.toThrow(/exists/)
  })
})
