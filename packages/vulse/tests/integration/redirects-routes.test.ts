import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { redirectsRoutes } from '../../src/server/routes/redirects'
import { signUp, signIn, cookieFromResponse, signUpAsAdmin } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

async function makeContext() {
  await applyMigrations(env.DB)
  const db = createDb(env.DB)
  const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
  return { db, auth }
}

async function editorCookie(auth: Awaited<ReturnType<typeof createAuth>>, email: string) {
  await signUp(auth, email, 'password123', 'Editor')
  await env.DB.prepare(`UPDATE user SET role = 'editor' WHERE email = ?`).bind(email).run()
  return cookieFromResponse(await signIn(auth, email, 'password123'))
}

interface OkBody<T> { ok: true; data: T }
interface ErrBody { ok: false; error: { code: string; message: string } }

describe('redirects routes', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('list requires admin role', async () => {
    const { db, auth } = await makeContext()
    const routes = redirectsRoutes(db, auth)

    const anon = await routes.list(new Request('http://localhost/api/vulse/redirects'))
    expect(anon.status).toBe(403)

    const editor = await editorCookie(auth, 'editor@x.com')
    const editorRes = await routes.list(new Request('http://localhost/api/vulse/redirects', { headers: { cookie: editor } }))
    expect(editorRes.status).toBe(403)
  })

  it('admin can list, create, update, delete', async () => {
    const { db, auth } = await makeContext()
    const routes = redirectsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth, 'admin1@x.com')

    const createRes = await routes.create(new Request('http://localhost/api/vulse/redirects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromPath: '/blog/old', toUrl: '/blog/new', status: 302 }),
    }))
    expect(createRes.status).toBe(200)
    const created = await createRes.json() as OkBody<{ id: string; fromPath: string; status: number }>
    expect(created.data.fromPath).toBe('/blog/old')
    expect(created.data.status).toBe(302)

    const listRes = await routes.list(new Request('http://localhost/api/vulse/redirects', { headers: { cookie } }))
    const list = await listRes.json() as OkBody<unknown[]>
    expect(list.data.length).toBe(1)

    const updateRes = await routes.update(new Request('http://localhost/api/vulse/redirects/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ enabled: false, status: 301 }),
    }), { id: created.data.id })
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json() as OkBody<{ enabled: boolean; status: number }>
    expect(updated.data.enabled).toBe(false)
    expect(updated.data.status).toBe(301)

    const delRes = await routes.delete(new Request('http://localhost/api/vulse/redirects/x', { method: 'DELETE', headers: { cookie } }), { id: created.data.id })
    expect(delRes.status).toBe(200)

    const afterList = await routes.list(new Request('http://localhost/api/vulse/redirects', { headers: { cookie } }))
    const after = await afterList.json() as OkBody<unknown[]>
    expect(after.data.length).toBe(0)
  })

  it('rejects invalid from path and to URL', async () => {
    const { db, auth } = await makeContext()
    const routes = redirectsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth, 'admin2@x.com')

    const noSlash = await routes.create(new Request('http://localhost/api/vulse/redirects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromPath: 'no-leading-slash', toUrl: '/x' }),
    }))
    expect(noSlash.status).toBe(422)

    const badProto = await routes.create(new Request('http://localhost/api/vulse/redirects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromPath: '/from', toUrl: 'ftp://x' }),
    }))
    expect(badProto.status).toBe(422)
  })

  it('conflicts on duplicate from path', async () => {
    const { db, auth } = await makeContext()
    const routes = redirectsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth, 'admin3@x.com')

    await routes.create(new Request('http://localhost/api/vulse/redirects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromPath: '/dup', toUrl: '/a' }),
    }))
    const second = await routes.create(new Request('http://localhost/api/vulse/redirects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromPath: '/DUP', toUrl: '/b' }),
    }))
    expect(second.status).toBe(409)
    const body = await second.json() as ErrBody
    expect(body.error.code).toBe('CONFLICT')
  })
})
