import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { usersRoutes } from '../../src/server/routes/users'
import { signUp, signIn, signUpAsAdmin, cookieFromResponse } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

describe('users routes', () => {
  async function setup() {
    await applyMigrations(env.DB)
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
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

  it('admin can search users by email', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'unique-search@x.com', 'password123', 'Unique')
    const cookie = await signUpAsAdmin(env, auth, 'admin@x.com')

    const res = await routes.list(new Request('http://localhost/api/vulse/users?q=unique-search', { headers: { cookie } }))
    const body = await res.json() as { data: Array<{ email: string }> }
    expect(body.data.some((u) => u.email === 'unique-search@x.com')).toBe(true)
  })

  it('admin can get and update a user', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'target@x.com', 'password123', 'Target')
    const cookie = await signUpAsAdmin(env, auth, 'admin@x.com')
    const userRow = await env.DB.prepare(`SELECT id FROM user WHERE email = 'target@x.com'`).first<{ id: string }>()

    const getRes = await routes.get(new Request('http://localhost', { headers: { cookie } }), { id: userRow!.id })
    expect(getRes.status).toBe(200)

    const patchRes = await routes.update(new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Updated Name', displayName: 'Display', role: 'editor' }),
    }), { id: userRow!.id })
    expect(patchRes.status).toBe(200)
    const updated = await patchRes.json() as { data: { name: string; displayName: string; role: string } }
    expect(updated.data.name).toBe('Updated Name')
    expect(updated.data.displayName).toBe('Display')
    expect(updated.data.role).toBe('editor')
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

  it('admin can set another user password', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'target@x.com', 'password123', 'Target')
    const cookie = await signUpAsAdmin(env, auth, 'admin@x.com')
    const userRow = await env.DB.prepare(`SELECT id FROM user WHERE email = 'target@x.com'`).first<{ id: string }>()

    const res = await routes.resetPassword(new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ action: 'set', password: 'newpassword99' }),
    }), { id: userRow!.id })
    expect(res.status).toBe(200)

    const signInRes = await signIn(auth, 'target@x.com', 'newpassword99')
    expect(signInRes.status).toBe(200)
  })

  it('admin can trigger password reset email', async () => {
    const { auth, routes } = await setup()
    await signUp(auth, 'target@x.com', 'password123', 'Target')
    const cookie = await signUpAsAdmin(env, auth, 'admin@x.com')
    const userRow = await env.DB.prepare(`SELECT id FROM user WHERE email = 'target@x.com'`).first<{ id: string }>()

    const res = await routes.resetPassword(new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ action: 'email' }),
    }), { id: userRow!.id })
    expect(res.status).toBe(200)

    const tokenRow = await env.DB.prepare(`SELECT id FROM verification WHERE identifier LIKE 'reset-password:%'`).first()
    expect(tokenRow).toBeTruthy()
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

describe('password reset flow', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB)
  })

  it('request and complete password reset', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    await signUp(auth, 'reset@x.com', 'password123', 'Reset User')

    const requestRes = await auth.handler(new Request('http://localhost/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ email: 'reset@x.com', redirectTo: '/reset-password' }),
    }))
    expect(requestRes.status).toBe(200)

    const verification = await env.DB.prepare(`SELECT value FROM verification WHERE identifier LIKE 'reset-password:%'`).first<{ value: string }>()
    expect(verification?.value).toBeTruthy()
    const tokenRow = await env.DB.prepare(`SELECT identifier FROM verification WHERE identifier LIKE 'reset-password:%'`).first<{ identifier: string }>()
    const token = tokenRow!.identifier.replace('reset-password:', '')

    const resetRes = await auth.handler(new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'brandnewpass' }),
    }))
    expect(resetRes.status).toBe(200)

    const signInRes = await signIn(auth, 'reset@x.com', 'brandnewpass')
    expect(signInRes.status).toBe(200)
  })
})
