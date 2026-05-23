import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.forms.list(request)
}

export const POST: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.forms.create(request)
}
