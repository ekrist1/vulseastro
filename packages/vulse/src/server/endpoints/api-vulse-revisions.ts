import type { APIRoute } from 'astro'
import { getRuntime } from '../runtime.js'
import { registryFromUserCollections } from '../../core/blueprints/load.js'
import { getRuntimeEnv } from '../env.js'

export const GET: APIRoute = async ({ params, request }) => {
  const env = getRuntimeEnv()
  const registry = await registryFromUserCollections()
  const rt = await getRuntime(env, registry, new URL(request.url).origin)
  return rt.routes.revisions.list(request, params as Record<string, string>)
}
