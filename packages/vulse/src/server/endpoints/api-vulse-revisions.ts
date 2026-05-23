import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.revisions.list(request, params as Record<string, string>)
}
