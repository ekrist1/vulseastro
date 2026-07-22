import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { previewSessionsRoutes } from '../../src/server/routes/preview-sessions'
import { signUp, signIn, cookieFromResponse } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

const page = defineCollection({
  name: 'page',
  label: 'Page',
  schema: z.object({ title: z.string(), slug: z.string() }),
  admin: { titleField: 'title' },
  preview: { path: '/pages/{slug}' },
})

async function editorCookie(auth: Awaited<ReturnType<typeof createAuth>>, email: string) {
  await signUp(auth, email, 'password123', 'Editor')
  await env.DB.prepare(`UPDATE user SET role = 'editor' WHERE email = ?`).bind(email).run()
  return cookieFromResponse(await signIn(auth, email, 'password123'))
}

async function makeContext() {
  await applyMigrations(env.DB)
  const db = createDb(env.DB)
  const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
  const reg = new BlueprintRegistry()
  reg.register(page)
  return { db, auth, reg }
}

describe('preview sessions routes', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('unauthenticated create returns 403', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = previewSessionsRoutes(db, auth, reg)

    const res = await routes.create(new Request('http://localhost/api/vulse/preview/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'page',
        slug: 'about',
        content: { title: 'About', slug: 'about' },
      }),
    }))
    expect(res.status).toBe(403)
  })

  it('editor creates session with previewUrl containing vulse_live_preview', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = previewSessionsRoutes(db, auth, reg)
    const cookie = await editorCookie(auth, 'editor@x.com')

    const res = await routes.create(new Request('http://localhost/api/vulse/preview/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        collection: 'page',
        entryId: 'e1',
        slug: 'about',
        content: { title: 'About', slug: 'about' },
      }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: true; data: { id: string; previewUrl: string; expiresAt: string } }
    expect(body.data.id).toBeTruthy()
    expect(body.data.previewUrl).toContain('vulse_live_preview=')
    expect(body.data.previewUrl).toContain(body.data.id)
    expect(body.data.previewUrl).toContain('/pages/about')
    expect(body.data.expiresAt).toBeTruthy()
  })

  it('owner can update session content', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = previewSessionsRoutes(db, auth, reg)
    const cookie = await editorCookie(auth, 'editor@x.com')

    const create = await routes.create(new Request('http://localhost/api/vulse/preview/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        collection: 'page',
        slug: 'about',
        content: { title: 'About', slug: 'about' },
      }),
    }))
    const { data } = await create.json() as { data: { id: string } }

    const update = await routes.update(new Request('http://localhost/api/vulse/preview/sessions/' + data.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content: { title: 'Updated', slug: 'about' } }),
    }), { id: data.id })
    expect(update.status).toBe(200)
    const updated = await update.json() as { ok: true; data: { expiresAt: string } }
    expect(updated.data.expiresAt).toBeTruthy()
  })

  it('wrong user update returns 403', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = previewSessionsRoutes(db, auth, reg)
    const cookie1 = await editorCookie(auth, 'editor1@x.com')
    const cookie2 = await editorCookie(auth, 'editor2@x.com')

    const create = await routes.create(new Request('http://localhost/api/vulse/preview/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie1 },
      body: JSON.stringify({
        collection: 'page',
        slug: 'about',
        content: { title: 'About', slug: 'about' },
      }),
    }))
    const { data } = await create.json() as { data: { id: string } }

    const update = await routes.update(new Request('http://localhost/api/vulse/preview/sessions/' + data.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: cookie2 },
      body: JSON.stringify({ content: { title: 'Hacked', slug: 'about' } }),
    }), { id: data.id })
    expect(update.status).toBe(403)
  })
})
