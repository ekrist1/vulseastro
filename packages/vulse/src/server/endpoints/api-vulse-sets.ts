import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (params.handle) return rt.routes.sets.get(request, params as Record<string, string>)
  return rt.routes.sets.list(request)
}

export const POST: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.sets.create(request)
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.sets.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.sets.delete(request, params as Record<string, string>)
}
