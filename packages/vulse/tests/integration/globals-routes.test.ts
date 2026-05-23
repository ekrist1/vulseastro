import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { globalsRoutes } from '../../src/server/routes/globals'
import { globalsPublicRoutes } from '../../src/server/routes/globals-public'
import { signUpAsAdmin, signUp, signIn, cookieFromResponse } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

const siteGlobal = {
  handle: 'site',
  label: 'Site',
  fields: [
    { name: 'siteName', ui: { kind: 'text' as const }, optional: false },
  ],
}

describe('globals routes', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('requires admin for create', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = globalsRoutes(db, auth)

    const res = await routes.create(new Request('http://localhost/api/vulse/globals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(siteGlobal),
    }))
    expect(res.status).toBe(403)
  })

  it('admin can create empty set, update value, and public API reads it', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const adminRoutes = globalsRoutes(db, auth)
    const publicRoutes = globalsPublicRoutes(db)
    const cookie = await signUpAsAdmin(env, auth)

    const create = await adminRoutes.create(new Request('http://localhost/api/vulse/globals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ handle: 'footer', label: 'Footer', fields: [] }),
    }))
    expect(create.status).toBe(200)

    await adminRoutes.create(new Request('http://localhost/api/vulse/globals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(siteGlobal),
    }))

    const update = await adminRoutes.updateValue(new Request('http://localhost/api/vulse/globals/site/value', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ siteName: 'Vulse' }),
    }), { handle: 'site' })
    expect(update.status).toBe(200)

    const all = await publicRoutes.list()
    const allBody = await all.json() as { ok: true; data: Record<string, Record<string, unknown>> }
    expect(allBody.data.site?.siteName).toBe('Vulse')
    expect(allBody.data.footer).toEqual({})

    const one = await publicRoutes.get(new Request('http://localhost/api/vulse/public/globals/site'), { handle: 'site' })
    const oneBody = await one.json() as { ok: true; data: { siteName: string } }
    expect(oneBody.data.siteName).toBe('Vulse')
  })

  it('editor can read but not write', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = globalsRoutes(db, auth)
    const adminCookie = await signUpAsAdmin(env, auth)

    await routes.create(new Request('http://localhost/api/vulse/globals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify(siteGlobal),
    }))

    await signUp(auth, 'editor@x.com', 'password123', 'Editor')
    await env.DB.prepare(`UPDATE user SET role = 'editor' WHERE email = ?`).bind('editor@x.com').run()
    const editorCookie = cookieFromResponse(await signIn(auth, 'editor@x.com', 'password123'))

    const get = await routes.get(new Request('http://localhost/api/vulse/globals/site', { headers: { cookie: editorCookie } }), { handle: 'site' })
    expect(get.status).toBe(200)

    const write = await routes.updateValue(new Request('http://localhost/api/vulse/globals/site/value', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: editorCookie },
      body: JSON.stringify({ siteName: 'Nope' }),
    }), { handle: 'site' })
    expect(write.status).toBe(403)
  })
})
