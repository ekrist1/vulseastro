import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.settings.list(request)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.settings.set(request, params as Record<string, string>)
}
