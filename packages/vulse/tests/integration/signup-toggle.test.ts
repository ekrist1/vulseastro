import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { SettingsRepo } from '../../src/core/repos/settings'
import { createAuth } from '../../src/server/better-auth'

const SECRET = 'a'.repeat(32)

describe('sign-up toggle', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('rejects sign-up when allowMemberSignUp is false (default)', async () => {
    const auth = await createAuth(createDb(env.DB), { baseURL: 'http://x', secret: SECRET })
    const res = await auth.handler(new Request('http://x/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@x.com', password: 'password123', name: 'M' }),
    }))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('allows sign-up when toggled on', async () => {
    const db = createDb(env.DB)
    await new SettingsRepo(db).set('allowMemberSignUp', true)
    const auth = await createAuth(db, { baseURL: 'http://x', secret: SECRET })
    const res = await auth.handler(new Request('http://x/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@x.com', password: 'password123', name: 'M' }),
    }))
    expect(res.status).toBe(200)
  })
})
