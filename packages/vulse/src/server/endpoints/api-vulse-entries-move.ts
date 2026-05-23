import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const PATCH: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.entries.move(request, params as Record<string, string>)
}
