import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { definePlugin } from '../../src'
import { __testResetVulsePlugins, setVulsePlugins } from '../../src/server/plugins'

const SECRET = 'a'.repeat(32)

describe('better-auth wiring', () => {
  beforeEach(async () => {
    __testResetVulsePlugins()
    await applyMigrations(env.DB)
  })

  it('signs up a member and returns a session', async () => {
    const auth = await createAuth(createDb(env.DB), { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const req = new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@example.com', password: 'password123', name: 'Member' }),
    })
    const res = await auth.handler(req)
    expect(res.status).toBe(200)
  })

  it('rejects sign-up when disabled', async () => {
    const auth = await createAuth(createDb(env.DB), { baseURL: 'http://localhost', secret: SECRET, allowSignUp: false })
    const req = new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@example.com', password: 'password123', name: 'Member' }),
    })
    const res = await auth.handler(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('runs user-created plugin hooks on sign-up', async () => {
    const emails: string[] = []
    setVulsePlugins([
      definePlugin({
        id: 'welcome-email',
        hooks: {
          'auth:userAfterCreate': ({ user }) => {
            emails.push(String(user.email))
          },
        },
      }),
    ])
    const auth = await createAuth(createDb(env.DB), { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const req = new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'welcome@example.com', password: 'password123', name: 'Member' }),
    })
    const res = await auth.handler(req)
    expect(res.status).toBe(200)
    expect(emails).toEqual(['welcome@example.com'])
  })
})
