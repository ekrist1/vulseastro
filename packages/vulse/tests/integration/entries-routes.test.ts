import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
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
  const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
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

  it('POST auto-increments slug when duplicate exists', async () => {
    const { db, auth, reg } = await makeContext()
    const routes = entriesRoutes(db, auth, reg)
    const cookie = await signUpAsAdmin(env, auth)

    const body = { slug: 'hello', content: { title: 'Hi', slug: 'hello', body: '' } }
    const first = await routes.create(new Request('http://localhost/api/vulse/entries/post', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }), { collection: 'post' })
    expect(first.status).toBe(200)

    const second = await routes.create(new Request('http://localhost/api/vulse/entries/post', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }), { collection: 'post' })
    expect(second.status).toBe(200)
    const payload = await second.json() as { ok: true; data: { slug: string } }
    expect(payload.data.slug).toBe('hello-2')
  })

  it('GET tree returns entries for admin even when read access requires a published entry', async () => {
    const { db, auth, reg } = await makeContext()
    const page = defineCollection({
      name: 'page', label: 'Page', tree: true,
      schema: z.object({ title: z.string(), slug: z.string() }),
      admin: { titleField: 'title' },
      access: {
        read: ({ user, entry }) => entry?.status === 'published' && !!user,
        create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
        update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
        delete: ({ user }) => user?.role === 'admin',
      },
    })
    reg.register(page)
    const routes = entriesRoutes(db, auth, reg)
    const cookie = await signUpAsAdmin(env, auth)

    const created = await routes.create(new Request('http://localhost', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ slug: 'home', content: { title: 'Home', slug: 'home' }, status: 'draft' }),
    }), { collection: 'page' })
    expect(created.status).toBe(200)

    const treeRes = await routes.tree(new Request('http://localhost', { headers: { cookie } }), {
      collection: 'page',
    })
    expect(treeRes.status).toBe(200)
    const treeBody = await treeRes.json() as { data: Array<{ slug: string }> }
    expect(treeBody.data.map((n) => n.slug)).toEqual(['home'])
  })
})
