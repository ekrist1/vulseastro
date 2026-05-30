import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const POST: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.blueprints.importTemplate(request)
}
