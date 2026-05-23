import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { entriesRoutes } from '../../src/server/routes/entries'
import { signUpAsAdmin } from '../helpers/auth'

const SECRET = 'a'.repeat(32)
const post = defineCollection({
  name: 'post', label: 'Post',
  schema: z.object({ title: z.string().min(1), slug: z.string(), body: z.string().default('') }),
  admin: { titleField: 'title' },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})

async function makeContext() {
  await applyMigrations(env.DB)
  const db = createDb(env.DB)
  const auth = createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
  const reg = new BlueprintRegistry(); reg.register(post)
  return { db, auth, reg }
}

describe('entries routes', () => {
  it('POST creates an entry; GET returns it; unauth → 403', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = entriesRoutes(db, auth, reg)
    const cookie = await signUpAsAdmin(env, auth)

    const createReq = new Request('http://localhost/api/vulse/entries/post', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ slug: 'hello', content: { title: 'Hi', slug: 'hello', body: '' } }),
    })
    const created = await routes.create(createReq, { collection: 'post' })
    expect(created.status).toBe(200)
    const body = await created.json() as { ok: true; data: { id: string } }

    const getReq = new Request(`http://localhost/api/vulse/entries/post/${body.data.id}`, { headers: { cookie } })
    const got = await routes.findById(getReq, { collection: 'post', id: body.data.id })
    expect(got.status).toBe(200)

    const unauth = await routes.create(new Request('http://localhost/api/vulse/entries/post', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'x', content: { title: 'x', slug: 'x', body: '' } }),
    }), { collection: 'post' })
    expect(unauth.status).toBe(403)
  })

  it('PUT updates and records a revision', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = entriesRoutes(db, auth, reg)
    const cookie = await signUpAsAdmin(env, auth)

    const create = await routes.create(new Request('http://localhost', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ slug: 'r', content: { title: 'a', slug: 'r', body: '' } }),
    }), { collection: 'post' })
    const { data } = await create.json() as { data: { id: string } }

    const update = await routes.update(new Request('http://localhost', {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content: { title: 'b', slug: 'r', body: '' } }),
    }), { collection: 'post', id: data.id })
    expect(update.status).toBe(200)
    const updated = await update.json() as { data: { version: number } }
    expect(updated.data.version).toBe(2)
  })
})
