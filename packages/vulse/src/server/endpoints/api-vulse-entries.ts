import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (params.id) return rt.routes.entries.findById(request, params as Record<string, string>)
  return rt.routes.entries.list(request, params as Record<string, string>)
}

export const POST: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.entries.create(request, params as Record<string, string>)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.entries.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.entries.delete(request, params as Record<string, string>)
}
