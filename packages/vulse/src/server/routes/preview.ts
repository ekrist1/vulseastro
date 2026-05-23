import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { mintPreviewToken } from '../preview.js'

export function previewRoutes(auth: Auth, secret: string) {
  return {
    start: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async ({ auth: authCtx, url }) => {
      const token = await mintPreviewToken(secret, authCtx.user!.id)
      const secure = url.protocol === 'https:'
      const cookie = `vulse_preview=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure ? '; Secure' : ''}`
      const redirect = new URL(url.searchParams.get('to') ?? '/', url.origin)
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
