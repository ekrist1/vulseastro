import { defineMiddleware } from 'astro:middleware'
import { createDb } from '../core/db.js'
import { getRuntime } from '../server/runtime.js'
import { getRuntimeEnv } from '../server/env.js'
import { registryForRequest } from '../core/blueprints/load.js'
import { previewSecret, verifyPreviewToken } from '../server/preview.js'
import { RedirectsRepo, loadRedirectsSnapshot, normalizePath } from '../core/repos/redirects.js'
import { injectLivePreviewBridge, loadLivePreviewSession, type LivePreviewLocals } from './live-preview-middleware-helpers.js'

// Static-asset extensions that should bypass redirect lookup. Deliberately a
// closed allowlist rather than "any segment containing a dot" so legitimate
// content slugs like /v1.2-release-notes or /about.us still get checked.
const ASSET_EXTENSION_RE = /\.(?:css|js|mjs|cjs|map|json|xml|txt|ico|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|otf|eot|mp[34]|mpe?g|webm|ogg|wav|pdf|zip|gz|wasm|html?)$/i

function shouldCheckRedirect(path: string): boolean {
  if (path.startsWith('/admin')) return false
  if (path.startsWith('/api/')) return false
  if (ASSET_EXTENSION_RE.test(path)) return false
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

// Errors that mean "redirects table not yet available" — we want these
// silenced because they fire before migrations or outside the CF runtime.
// Anything else gets logged so real DB problems don't disappear.
function isExpectedRedirectFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('no such table') ||
    msg.includes('binding "db"') ||
    msg.includes('runtime env')
  )
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = new URL(ctx.request.url)
  const path = url.pathname
  const locals = ctx.locals as LivePreviewLocals

  if (shouldCheckRedirect(path)) {
    try {
      const env = getRuntimeEnv()
      const db = createDb(env.DB)
      const snapshot = await loadRedirectsSnapshot(db)
      if (snapshot.size > 0) {
        const hit = snapshot.get(normalizePath(path))
        if (hit) {
          // Fire-and-forget hit counter; do not block the redirect.
          void new RedirectsRepo(db).recordHit(hit.id).catch((err) => {
            console.warn('[vulse] failed to record redirect hit:', err)
          })
          return ctx.redirect(buildRedirectTarget(hit.toUrl, url), hit.status)
        }
      }
    } catch (err) {
      if (!isExpectedRedirectFailure(err)) {
        console.error('[vulse] redirect lookup failed:', err)
      }
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
