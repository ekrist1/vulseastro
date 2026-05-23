import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { PreviewSessionsRepo } from '../../src/core/repos/preview-sessions'
import { mintPreviewToken } from '../../src/server/preview'
import { signUp, signIn, cookieFromResponse } from '../helpers/auth'
import { invalidateRuntime } from '../../src/server/runtime'
import { injectLivePreviewBridge, loadLivePreviewSession } from '../../src/integration/live-preview-middleware-helpers'

const SECRET = 'a'.repeat(32)

type Locals = {
  vulsePreview?: boolean
  vulseUser?: { id: string }
  vulseLivePreview?: {
    entryId: string | null
    collection: string
    slug: string
    content: unknown
  } | null
}

async function createUserWithCookie(email: string) {
  const db = createDb(env.DB)
  const auth = await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
  await signUp(auth, email, 'password123', 'Editor')
  const signInRes = await signIn(auth, email, 'password123')
  const cookie = cookieFromResponse(signInRes)
  const row = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first<{ id: string }>()
  if (!row?.id) throw new Error('failed to load user id')
  return { userId: row.id, cookie, auth }
}

describe('live preview middleware helpers', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB)
    invalidateRuntime()
  })

  afterEach(() => {
    invalidateRuntime()
  })

  it('loads session from query token when valid vulse_preview cookie is present', async () => {
    const { userId } = await createUserWithCookie('editor1@example.com')
    const repo = new PreviewSessionsRepo(createDb(env.DB))
    const session = await repo.create({
      userId,
      entryId: 'entry-1',
      collection: 'page',
      slug: 'about',
      content: { title: 'Live About' },
    })
    const previewCookie = await mintPreviewToken(SECRET, userId)
    const request = new Request(`http://localhost/about?vulse_live_preview=${session.id}`, {
      headers: { cookie: `vulse_preview=${previewCookie}` },
    })
    const locals: Locals = { vulsePreview: true }

    const result = await loadLivePreviewSession(request, locals, {
      DB: env.DB,
      BUCKET: env.BUCKET,
      BETTER_AUTH_SECRET: SECRET,
    })

    expect(result.token).toBe(session.id)
    expect(result.tokenFromQuery).toBe(true)
    expect(locals.vulseLivePreview).toEqual({
      entryId: 'entry-1',
      collection: 'page',
      slug: 'about',
      content: { title: 'Live About' },
    })
  })

  it('loads session for matching authenticated user from cookie token', async () => {
    const { userId, cookie, auth } = await createUserWithCookie('editor2@example.com')
    const repo = new PreviewSessionsRepo(createDb(env.DB))
    const session = await repo.create({
      userId,
      collection: 'page',
      slug: 'hello',
      content: { title: 'Hello' },
    })
    const request = new Request('http://localhost/hello', {
      headers: { cookie: `${cookie}; vulse_live_preview=${session.id}` },
    })
    const locals: Locals = {}

    const result = await loadLivePreviewSession(request, locals, {
      DB: env.DB,
      BUCKET: env.BUCKET,
      BETTER_AUTH_SECRET: SECRET,
    }, {
      getSessionUser: async (req) => {
        const session = await auth.api.getSession({ headers: req.headers })
        return (session?.user as { id?: string } | undefined) ?? null
      },
    })

    expect(result.tokenFromQuery).toBe(false)
    expect(result.token).toBe(session.id)
    expect(locals.vulseUser?.id).toBe(userId)
    expect(locals.vulseLivePreview?.content).toEqual({ title: 'Hello' })
  })

  it('injects bridge script, robots header, and persistence cookie for HTML responses', async () => {
    const req = new Request('https://example.com/page?vulse_live_preview=tok123')
    const res = new Response('<html><body><h1>Page</h1></body></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

    const out = await injectLivePreviewBridge(req, '/page', res, {
      hasLivePreview: true,
      token: 'tok123',
      tokenFromQuery: true,
    })
    const text = await out.text()

    expect(text).toContain('<script type="module" src="/api/vulse/preview/bridge.js"></script></body>')
    expect(out.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(out.headers.get('set-cookie')).toContain('vulse_live_preview=tok123')
    expect(out.headers.get('set-cookie')).toContain('HttpOnly')
    expect(out.headers.get('set-cookie')).toContain('Secure')
  })
})
