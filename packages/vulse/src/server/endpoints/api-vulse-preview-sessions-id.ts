import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const ALL: APIRoute = async ({ request, params }) => {
  const rt = await withRuntime(request)
  const id = params.id!
  if (request.method === 'PUT') return rt.routes.previewSessions.update(request, { id })
  if (request.method === 'DELETE') return rt.routes.previewSessions.remove(request, { id })
  return new Response('Method Not Allowed', { status: 405 })
}
