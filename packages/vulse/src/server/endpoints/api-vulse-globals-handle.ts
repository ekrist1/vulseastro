import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (!params.handle) return new Response('Not found', { status: 404 })
  return rt.routes.globals.get(request, params as Record<string, string>)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (!params.handle) return new Response('Not found', { status: 404 })
  return rt.routes.globals.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (!params.handle) return new Response('Not found', { status: 404 })
  return rt.routes.globals.delete(request, params as Record<string, string>)
}
