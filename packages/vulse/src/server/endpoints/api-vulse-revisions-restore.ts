import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const POST: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.revisions.restore(request, params as Record<string, string>)
}
