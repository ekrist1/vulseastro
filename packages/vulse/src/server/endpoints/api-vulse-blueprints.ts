import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (params.handle) return rt.routes.blueprints.get(request, params as Record<string, string>)
  return rt.routes.blueprints.list(request)
}

export const POST: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.blueprints.create(request)
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.blueprints.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.blueprints.delete(request, params as Record<string, string>)
}
