import { z } from 'zod'
import type { Auth } from './better-auth.js'
import type { AuthContext, Role } from '../core/blueprints/types.js'
import { AccessDeniedError, ValidationError } from '../core/errors.js'
import { fail, ok } from './envelope.js'

export interface HandlerCtx<P, B> {
  request: Request
  url: URL
  params: P
  body: B
  auth: AuthContext
}

export interface HandlerOptions<P, B> {
  params?: z.ZodType<P>
  body?: z.ZodType<B>
  requireRole?: Role[]
}

export function defineHandler<P = unknown, B = unknown, R = unknown>(
  auth: Auth,
  opts: HandlerOptions<P, B>,
  fn: (ctx: HandlerCtx<P, B>) => Promise<R>,
) {
  return async (request: Request, rawParams: Record<string, string> = {}): Promise<Response> => {
    try {
      const url = new URL(request.url)

      let params: P = rawParams as unknown as P
      if (opts.params) {
        const parsed = opts.params.safeParse(rawParams)
        if (!parsed.success) throw new ValidationError('Invalid params', { issues: parsed.error.issues })
        params = parsed.data
      }

      let body: B = undefined as unknown as B
      if (opts.body && request.method !== 'GET' && request.method !== 'DELETE') {
        const raw = await request.json().catch(() => undefined)
        const parsed = opts.body.safeParse(raw)
        if (!parsed.success) throw new ValidationError('Invalid body', { issues: parsed.error.issues })
        body = parsed.data
      }

      const session = await auth.api.getSession({ headers: request.headers })
      const authCtx: AuthContext = session ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          role: (session.user as { role?: Role }).role ?? 'member',
        },
      } : { user: null }

      if (opts.requireRole && !authCtx.user) throw new AccessDeniedError('Authentication required')
      if (opts.requireRole && authCtx.user && !opts.requireRole.includes(authCtx.user.role)) {
        throw new AccessDeniedError(`Requires role: ${opts.requireRole.join(' or ')}`)
      }

      const result = await fn({ request, url, params, body, auth: authCtx })
      if (result instanceof Response) return result
      return ok(result)
    } catch (err) {
      return fail(err)
    }
  }
}
