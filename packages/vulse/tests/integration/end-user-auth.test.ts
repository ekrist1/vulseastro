import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { SettingsRepo } from '../../src/core/repos/settings'
import { createAuth } from '../../src/server/better-auth'

const SECRET = 'a'.repeat(32)

describe('member journey', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('sign-up → sign-in → session → sign-out', async () => {
    const db = createDb(env.DB)
    await new SettingsRepo(db).set('allowMemberSignUp', true)
    const auth = await createAuth(db, { baseURL: 'http://x', secret: SECRET })

    const signUp = await auth.handler(new Request('http://x/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@x.com', password: 'password123', name: 'M' }),
    }))
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie') ?? ''

    const sessionRes = await auth.handler(new Request('http://x/api/auth/get-session', { headers: { cookie } }))
    const session = await sessionRes.json() as { user?: { email?: string; role?: string } } | null
    expect(session?.user?.email).toBe('m@x.com')
    expect(session?.user?.role).toBe('member')

    const signOut = await auth.handler(new Request('http://x/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie, origin: 'http://x', 'content-type': 'application/json' },
      body: '{}',
    }))
    expect([200, 204]).toContain(signOut.status)
  })
})
