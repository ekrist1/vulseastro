import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.media.delete(request, params as Record<string, string>)
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.media.updateAlt(request, params as Record<string, string>)
}
