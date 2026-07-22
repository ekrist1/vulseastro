import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { mediaRoutes } from '../../src/server/routes/media'
import { signUpAsAdmin } from '../helpers/auth'

const SECRET = 'a'.repeat(32)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZjYJ6cAAAAASUVORK5CYII=', 'base64')

async function makeContext() {
  await applyMigrations(env.DB)
  const db = createDb(env.DB)
  const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
  const routes = mediaRoutes(db, auth, { bucket: env.BUCKET, cfImages: {} })
  return { routes, auth }
}

describe('media routes', () => {
  it('uploads a PNG and records dimensions', async () => {
    const { routes, auth } = await makeContext()
    const cookie = await signUpAsAdmin(env, auth)

    const form = new FormData()
    form.append('file', new File([PNG], 'pic.png', { type: 'image/png' }))
    const res = await routes.upload(new Request('http://localhost/api/vulse/media', {
      method: 'POST',
      body: form,
      headers: { cookie },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: true; data: { id: string; width: number; height: number } }
    expect(body.data.width).toBe(1)
    expect(body.data.height).toBe(1)
  })

  it('lists uploaded media', async () => {
    const { routes, auth } = await makeContext()
    const cookie = await signUpAsAdmin(env, auth)

    const form = new FormData()
    form.append('file', new File([PNG], 'pic.png', { type: 'image/png' }))
    await routes.upload(new Request('http://localhost/api/vulse/media', {
      method: 'POST',
      body: form,
      headers: { cookie },
    }))

    const list = await routes.list(new Request('http://localhost/api/vulse/media', { headers: { cookie } }))
    expect(list.status).toBe(200)
    const body = await list.json() as { ok: true; data: { previewUrl: string }[] }
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    // Frontend preview URL must point at the public route, not the admin-only one.
    expect(body.data[0]!.previewUrl).toMatch(/^\/api\/vulse\/public\/media\/.+\/file$/)
  })

  it('serves the public file without auth and with a long public cache', async () => {
    const { routes, auth } = await makeContext()
    const cookie = await signUpAsAdmin(env, auth)

    const form = new FormData()
    form.append('file', new File([PNG], 'pic.png', { type: 'image/png' }))
    const up = await routes.upload(new Request('http://localhost/api/vulse/media', {
      method: 'POST',
      body: form,
      headers: { cookie },
    }))
    const { data } = await up.json() as { data: { id: string } }

    // No cookie — anonymous visitor.
    const res = await routes.publicFile(new Request(`http://localhost/api/vulse/public/media/${data.id}/file`), { id: data.id })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    // Drain the R2 body stream so Miniflare's isolated storage can tear down cleanly.
    await res.arrayBuffer()
  })

  it('returns 404 for a missing public file', async () => {
    const { routes } = await makeContext()
    const res = await routes.publicFile(new Request('http://localhost/api/vulse/public/media/nope/file'), { id: 'nope' })
    expect(res.status).toBe(404)
  })
})
