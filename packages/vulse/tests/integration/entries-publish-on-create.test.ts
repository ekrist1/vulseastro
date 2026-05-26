import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { entriesRoutes } from '../../src/server/routes/entries'
import { signUpAsAdmin } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

// A drafts-enabled collection. "Save & publish" on a NEW entry sends { publish: true }
// to the create endpoint, which must publish immediately rather than store a draft.
const note = defineCollection({
  name: 'note', label: 'Note',
  schema: z.object({ title: z.string().min(1), slug: z.string(), body: z.string().default('') }),
  admin: { titleField: 'title' },
  drafts: true,
  access: { read: () => true, create: ({ user }) => !!user, update: ({ user }) => !!user, delete: ({ user }) => !!user },
})

async function ctx() {
  await applyMigrations(env.DB)
  const db = createDb(env.DB)
  const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
  const reg = new BlueprintRegistry(); reg.register(note)
  return { routes: entriesRoutes(db, auth, reg), cookie: await signUpAsAdmin(env, auth) }
}

function createReq(cookie: string, body: Record<string, unknown>) {
  return new Request('http://localhost/api/vulse/entries/note', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
  })
}

describe('publish on create (drafts-enabled collection)', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('publishes immediately when publish:true', async () => {
    const { routes, cookie } = await ctx()
    const res = await routes.create(
      createReq(cookie, { slug: 'n1', content: { title: 'N1', slug: 'n1', body: 'b' }, publish: true }),
      { collection: 'note' },
    )
    expect(res.status).toBe(200)
    const { data } = await res.json() as { data: { id: string; status: string; content: Record<string, unknown> } }
    expect(data.status).toBe('published')
    expect(data.content).toMatchObject({ title: 'N1' })
  })

  it('stores a draft when publish:false', async () => {
    const { routes, cookie } = await ctx()
    const res = await routes.create(
      createReq(cookie, { slug: 'n2', content: { title: 'N2', slug: 'n2', body: 'b' }, publish: false }),
      { collection: 'note' },
    )
    expect(res.status).toBe(200)
    const { data } = await res.json() as { data: { status: string } }
    expect(data.status).toBe('draft')
  })
})
