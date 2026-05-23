import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const GET: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (params.id) return rt.routes.forms.getSubmission(request, params as Record<string, string>)
  if (params.handle && request.url.includes('/submissions')) {
    return rt.routes.forms.listSubmissions(request, params as Record<string, string>)
  }
  return rt.routes.forms.get(request, params as Record<string, string>)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  return rt.routes.forms.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (params.id) return rt.routes.forms.deleteSubmission(request, params as Record<string, string>)
  return rt.routes.forms.delete(request, params as Record<string, string>)
}

export const POST: APIRoute = async ({ params, request }) => {
  const rt = await withRuntime(request)
  if (request.url.includes('/submissions/delete')) {
    return rt.routes.forms.bulkDeleteSubmissions(request, params as Record<string, string>)
  }
  return new Response('Not found', { status: 404 })
}
