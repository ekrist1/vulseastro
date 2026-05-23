import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const PUT: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (!params.handle) return new Response('Not found', { status: 404 })
  return rt.routes.globals.updateValue(request, params as Record<string, string>)
}
