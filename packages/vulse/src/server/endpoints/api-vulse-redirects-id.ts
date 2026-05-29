import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.redirects.get(request, params as Record<string, string>)
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.redirects.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.redirects.delete(request, params as Record<string, string>)
}
