import { createDb } from '../core/db.js'
import { PreviewSessionsRepo } from '../core/repos/preview-sessions.js'
import type { RuntimeEnv } from '../server/env.js'
import { getRuntime } from '../server/runtime.js'
import { registryForRequest } from '../core/blueprints/load.js'

export interface LivePreviewLocals {
  vulsePreview?: boolean
  vulseUser?: { id?: string }
  vulseLivePreview?: {
    entryId: string | null
    collection: string
    slug: string
    content: unknown
  } | null
}

export interface LivePreviewTokenResult {
  token: string | null
  tokenFromQuery: boolean
}

export interface InjectBridgeState extends LivePreviewTokenResult {
  hasLivePreview: boolean
}

export interface LoadLivePreviewDeps {
  getSessionUser?: (request: Request, env: RuntimeEnv) => Promise<{ id?: string } | null>
}

function readCookie(request: Request, key: string): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`))
  return match?.[1] ?? null
}

export function readLivePreviewToken(request: Request): LivePreviewTokenResult {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('vulse_live_preview')
  if (queryToken) return { token: queryToken, tokenFromQuery: true }
  return { token: readCookie(request, 'vulse_live_preview'), tokenFromQuery: false }
}

export async function loadLivePreviewSession(
  request: Request,
  locals: LivePreviewLocals,
  env: RuntimeEnv,
  deps: LoadLivePreviewDeps = {},
): Promise<LivePreviewTokenResult> {
  const tokenResult = readLivePreviewToken(request)
  if (!tokenResult.token) return tokenResult

  const db = createDb(env.DB)
  const repo = new PreviewSessionsRepo(db)
  const session = await repo.findById(tokenResult.token)
  if (!session) return tokenResult

  let authorized = !!locals.vulsePreview
  if (!authorized) {
    let userId = locals.vulseUser?.id
    if (!userId) {
      const authUser = await (deps.getSessionUser ?? resolveSessionUser)(request, env)
      if (authUser?.id) {
        locals.vulseUser = authUser
        userId = authUser.id
      }
    }
    authorized = userId === session.userId
  }

  if (!authorized) return tokenResult

  locals.vulseLivePreview = {
    entryId: session.entryId,
    collection: session.collection,
    slug: session.slug,
    content: session.content,
  }
  return tokenResult
}

async function resolveSessionUser(request: Request, env: RuntimeEnv): Promise<{ id?: string } | null> {
  const db = createDb(env.DB)
  const rt = await getRuntime(env, await registryForRequest(db), new URL(request.url).origin)
  const authSession = await rt.auth.api.getSession({ headers: request.headers })
  return (authSession?.user as { id?: string } | undefined) ?? null
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return /^text\/html\b/i.test(contentType)
}

export async function injectLivePreviewBridge(
  request: Request,
  path: string,
  response: Response,
  state: InjectBridgeState,
): Promise<Response> {
  if (!state.hasLivePreview || path.startsWith('/admin') || !isHtmlResponse(response)) return response

  const script = '<script type="module" src="/api/vulse/preview/bridge.js"></script>'
  const html = await response.text()
  const injected = html.replace(/<\/body>/i, `${script}</body>`)
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow')

  if (state.tokenFromQuery && state.token) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
    headers.append(
      'set-cookie',
      `vulse_live_preview=${encodeURIComponent(state.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure}`,
    )
  }

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
