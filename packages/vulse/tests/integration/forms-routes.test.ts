import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { formsRoutes } from '../../src/server/routes/forms'
import { signUpAsAdmin, signUp, signIn, cookieFromResponse } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

const sampleForm = {
  handle: 'contact',
  label: 'Contact',
  fields: [
    { name: 'email', ui: { kind: 'email' as const }, optional: false },
  ],
  settings: { enabled: true },
  actions: [],
}

describe('forms admin routes', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('requires admin for create', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = formsRoutes(db, auth)

    const res = await routes.create(new Request('http://localhost/api/vulse/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleForm),
    }))
    expect(res.status).toBe(403)
  })

  it('admin can create and list forms', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = formsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth)

    const create = await routes.create(new Request('http://localhost/api/vulse/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(sampleForm),
    }))
    expect(create.status).toBe(200)

    const list = await routes.list(new Request('http://localhost/api/vulse/forms', { headers: { cookie } }))
    const body = await list.json() as { ok: true; data: { handle: string }[] }
    expect(body.data.some((f) => f.handle === 'contact')).toBe(true)
  })

  it('admin can create form without fields and get preserves definition', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = formsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth)

    const create = await routes.create(new Request('http://localhost/api/vulse/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        handle: 'empty',
        label: 'Empty',
        fields: [],
        settings: { enabled: true },
        actions: [],
      }),
    }))
    expect(create.status).toBe(200)

    const get = await routes.get(new Request('http://localhost/api/vulse/forms/empty', { headers: { cookie } }), { handle: 'empty' })
    const row = await get.json() as { ok: true; data: { handle: string; definition: { fields: unknown[] } } }
    expect(row.data.handle).toBe('empty')
    expect(row.data.definition.fields).toEqual([])
  })

  it('admin get returns saved fields in definition', async () => {
    const db = createDb(env.DB)
    const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const routes = formsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth)

    await routes.create(new Request('http://localhost/api/vulse/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(sampleForm),
    }))

    const get = await routes.get(new Request('http://localhost/api/vulse/forms/contact', { headers: { cookie } }), { handle: 'contact' })
    const row = await get.json() as { ok: true; data: { definition: { fields: { name: string }[] } } }
    expect(row.data.definition.fields).toHaveLength(1)
    expect(row.data.definition.fields[0]!.name).toBe('email')
  })
})
