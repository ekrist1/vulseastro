import { defineMiddleware } from 'astro:middleware'
import { createDb } from '../core/db.js'
import { getRuntime } from '../server/runtime.js'
import { getRuntimeEnv } from '../server/env.js'
import { registryForRequest } from '../core/blueprints/load.js'
import { previewSecret, verifyPreviewToken } from '../server/preview.js'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = new URL(ctx.request.url).pathname

  try {
    const env = getRuntimeEnv()
    const previewToken = (ctx.request.headers.get('cookie') ?? '').match(/vulse_preview=([^;]+)/)?.[1]
    if (previewToken && await verifyPreviewToken(previewSecret(env), previewToken)) {
      ;(ctx.locals as { vulsePreview?: boolean }).vulsePreview = true
    }
  } catch {
    // env unavailable outside Cloudflare runtime
  }

  if (!path.startsWith('/admin') || path === '/admin/login') return next()

  try {
    const env = getRuntimeEnv()
    const db = createDb(env.DB)
    const rt = await getRuntime(env, await registryForRequest(db), new URL(ctx.request.url).origin)
    const session = await rt.auth.api.getSession({ headers: ctx.request.headers })
    if (!session) return ctx.redirect(`/admin/login?next=${encodeURIComponent(path)}`)
    ;(ctx.locals as { vulseUser?: typeof session.user }).vulseUser = session.user
    const role = (session.user as { role?: string }).role
    if (role !== 'admin' && role !== 'editor') {
      return new Response('Forbidden', { status: 403 })
    }
  } catch {
    return next()
  }
  return next()
})
