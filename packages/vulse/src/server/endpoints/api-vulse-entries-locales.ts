import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.entries.listLocales(request, params as Record<string, string>)
}

export const POST: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.entries.createLocale(request, params as Record<string, string>)
}
