import { defineMiddleware } from 'astro:middleware'
import { createDb } from '../core/db.js'
import { getRuntime } from '../server/runtime.js'
import { getRuntimeEnv } from '../server/env.js'
import { registryForRequest } from '../core/blueprints/load.js'
import { previewSecret, verifyPreviewToken } from '../server/preview.js'
import { RedirectsRepo } from '../core/repos/redirects.js'
import { injectLivePreviewBridge, loadLivePreviewSession, type LivePreviewLocals } from './live-preview-middleware-helpers.js'

function shouldCheckRedirect(path: string): boolean {
  if (path.startsWith('/admin')) return false
  if (path.startsWith('/api/')) return false
  // Skip anything with a file extension (assets, sourcemaps, favicons, …).
  if (/\.[^/]+$/.test(path)) return false
  return true
}

function buildRedirectTarget(toUrl: string, sourceUrl: URL): string {
  const absolute = /^https?:\/\//i.test(toUrl)
    ? toUrl
    : new URL(toUrl, sourceUrl).toString()
  const target = new URL(absolute)
  if (!target.search && sourceUrl.search) target.search = sourceUrl.search
  return target.toString()
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = new URL(ctx.request.url)
  const path = url.pathname
  const locals = ctx.locals as LivePreviewLocals

  if (shouldCheckRedirect(path)) {
    try {
      const env = getRuntimeEnv()
      const db = createDb(env.DB)
      const repo = new RedirectsRepo(db)
      const hit = await repo.findByPath(path)
      if (hit && hit.enabled) {
        // Fire-and-forget hit counter; do not block the redirect.
        void repo.recordHit(hit.id).catch(() => {})
        return ctx.redirect(buildRedirectTarget(hit.toUrl, url), hit.status)
      }
    } catch {
      // DB unavailable (e.g. running before migrations applied) — fall through.
    }
  }

  let livePreviewToken: string | null = null
  let livePreviewTokenFromQuery = false

  try {
    const env = getRuntimeEnv()
    const previewToken = (ctx.request.headers.get('cookie') ?? '').match(/vulse_preview=([^;]+)/)?.[1]
    if (previewToken && await verifyPreviewToken(previewSecret(env), previewToken)) {
      locals.vulsePreview = true
    }
    const live = await loadLivePreviewSession(ctx.request, locals, env)
    livePreviewToken = live.token
    livePreviewTokenFromQuery = live.tokenFromQuery
  } catch {
    // env unavailable outside Cloudflare runtime
  }

  if (path.startsWith('/admin') && path !== '/admin/login') {
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
    } catch (err) {
      console.error('[vulse] admin middleware error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  const response = await next()
  return injectLivePreviewBridge(ctx.request, path, response, {
    hasLivePreview: !!locals.vulseLivePreview,
    token: livePreviewToken,
    tokenFromQuery: livePreviewTokenFromQuery,
  })
})
