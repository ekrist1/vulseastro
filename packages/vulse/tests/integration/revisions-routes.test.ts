import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { entriesRoutes } from '../../src/server/routes/entries'
import { revisionsRoutes } from '../../src/server/routes/revisions'
import { signUpAsAdmin } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

describe('revisions routes', () => {
  it('lists revisions and restores a version', async () => {
    await applyMigrations(env.DB)
    const db = createDb(env.DB)
    const auth = createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
    const reg = new BlueprintRegistry()
    reg.register(defineCollection({
      name: 'post', label: 'P', schema: z.object({ title: z.string() }),
      admin: { titleField: 'title' },
      access: { read: () => true, create: ({ user }) => !!user, update: ({ user }) => !!user, delete: ({ user }) => user?.role === 'admin' },
    }))

    const entryRoutes = entriesRoutes(db, auth, reg)
    const revRoutes = revisionsRoutes(db, auth)
    const cookie = await signUpAsAdmin(env, auth)

    const created = await entryRoutes.create(new Request('http://localhost', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ slug: 'r', content: { title: 'v1' } }),
    }), { collection: 'post' })
    const { data: entry } = await created.json() as { data: { id: string } }

    await entryRoutes.update(new Request('http://localhost', {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content: { title: 'v2' } }),
    }), { collection: 'post', id: entry.id })

    await entryRoutes.update(new Request('http://localhost', {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content: { title: 'v3' } }),
    }), { collection: 'post', id: entry.id })

    const listRes = await revRoutes.list(new Request('http://localhost', { headers: { cookie } }), {
      collection: 'post', id: entry.id,
    })
    const listBody = await listRes.json() as { data: Array<{ version: number }> }
    expect(listBody.data.map((r) => r.version)).toEqual([3, 2, 1])

    const restoreRes = await revRoutes.restore(new Request('http://localhost', {
      method: 'POST', headers: { cookie },
    }), { collection: 'post', id: entry.id, version: '1' })
    expect(restoreRes.status).toBe(200)

    const got = await entryRoutes.findById(new Request('http://localhost', { headers: { cookie } }), {
      collection: 'post', id: entry.id,
    })
    const gotBody = await got.json() as { data: { content: { title: string }; version: number } }
    expect(gotBody.data.content).toEqual({ title: 'v1' })
    expect(gotBody.data.version).toBe(4)
  })
})
