import { defineMiddleware } from 'astro:middleware'
import { getRuntime } from '../server/runtime.js'
import { getRuntimeEnv } from '../server/env.js'
import { registryFromUserCollections } from '../core/blueprints/load.js'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = new URL(ctx.request.url).pathname
  if (!path.startsWith('/admin') || path === '/admin/login') return next()

  try {
    const env = getRuntimeEnv()
    const rt = await getRuntime(env, await registryFromUserCollections(), new URL(ctx.request.url).origin)
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
