import type { APIRoute } from 'astro'
import { getRuntime } from '../runtime.js'
import { registryFromUserCollections } from '../../core/blueprints/load.js'
import { getRuntimeEnv } from '../env.js'

async function handleSetRole(params: Record<string, string | undefined>, request: Request) {
  const env = getRuntimeEnv()
  const registry = await registryFromUserCollections()
  const rt = await getRuntime(env, registry, new URL(request.url).origin)
  return rt.routes.users.setRole(request, params as Record<string, string>)
}

export const POST: APIRoute = ({ params, request }) => handleSetRole(params, request)
export const PUT: APIRoute = ({ params, request }) => handleSetRole(params, request)
