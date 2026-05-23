import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { usersRoutes } from '../../src/server/routes/users'
import { signUp, signIn, signUpAsAdmin, cookieFromResponse } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

describe('users routes', () => {
  async function setup() {
    await applyMigrations(env.DB)
    const db = createDb(env.DB)
    const auth = createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = usersRoutes(db, auth)
    return { db, auth, routes }
  }

  it('admin lists users', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'member@x.com', 'password123', 'Member')
    const cookie = await signUpAsAdmin(env, auth, 'admin@x.com')

    const res = await routes.list(new Request('http://localhost', { headers: { cookie } }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ email: string }> }
    expect(body.data.length).toBeGreaterThanOrEqual(2)
  })

  it('admin can change role', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'target@x.com', 'password123', 'Target')
    const cookie = await signUpAsAdmin(env, auth, 'admin@x.com')

    const userRow = await env.DB.prepare(`SELECT id FROM user WHERE email = 'target@x.com'`).first<{ id: string }>()
    const res = await routes.setRole(new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ role: 'editor' }),
    }), { id: userRow!.id })
    expect(res.status).toBe(200)

    const updated = await env.DB.prepare(`SELECT role FROM user WHERE email = 'target@x.com'`).first<{ role: string }>()
    expect(updated?.role).toBe('editor')
  })

  it('non-admin cannot list users (403)', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'member@x.com', 'password123', 'Member')
    const res = await signIn(auth, 'member@x.com', 'password123')
    const cookie = cookieFromResponse(res)

    const listRes = await routes.list(new Request('http://localhost', { headers: { cookie } }))
    expect(listRes.status).toBe(403)
  })
})
