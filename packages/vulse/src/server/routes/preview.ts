import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { mintPreviewToken } from '../preview.js'

function safePreviewTarget(raw: string | null, origin: string): URL {
  const fallback = new URL('/', origin)
  if (!raw) return fallback
  // Reject anything that could escape origin: protocol-relative URLs (//evil.com)
  // and any input that isn't a single leading "/" path.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  try {
    const candidate = new URL(raw, origin)
    if (candidate.origin !== new URL(origin).origin) return fallback
    return candidate
  } catch {
    return fallback
  }
}

export function previewRoutes(auth: Auth, secret: string) {
  return {
    start: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async ({ auth: authCtx, url }) => {
      const token = await mintPreviewToken(secret, authCtx.user!.id)
      const secure = url.protocol === 'https:'
      const cookie = `vulse_preview=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure ? '; Secure' : ''}`
      const redirect = safePreviewTarget(url.searchParams.get('to'), url.origin)
      return new Response(null, { status: 302, headers: { Location: redirect.toString(), 'Set-Cookie': cookie } })
    }),
    stop: defineHandler(auth, {}, async ({ url }) => {
      return new Response(null, {
        status: 302,
        headers: { Location: new URL('/', url.origin).toString(), 'Set-Cookie': 'vulse_preview=; Path=/; Max-Age=0' },
      })
    }),
  }
}
