import type { APIRoute } from 'astro'
import { getRuntime } from '../runtime.js'
import { registryFromUserCollections } from '../../core/blueprints/load.js'
import { getRuntimeEnv } from '../env.js'

export const GET: APIRoute = async ({ params, request }) => {
  const env = getRuntimeEnv()
  const registry = await registryFromUserCollections()
  const rt = await getRuntime(env, registry, new URL(request.url).origin)
  if (params.id) return rt.routes.entries.findById(request, params as Record<string, string>)
  return rt.routes.entries.list(request, params as Record<string, string>)
}

export const POST: APIRoute = async ({ params, request }) => {
  const env = getRuntimeEnv()
  const registry = await registryFromUserCollections()
  const rt = await getRuntime(env, registry, new URL(request.url).origin)
  return rt.routes.entries.create(request, params as Record<string, string>)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const env = getRuntimeEnv()
  const registry = await registryFromUserCollections()
  const rt = await getRuntime(env, registry, new URL(request.url).origin)
  return rt.routes.entries.update(request, params as Record<string, string>)
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const env = getRuntimeEnv()
  const registry = await registryFromUserCollections()
  const rt = await getRuntime(env, registry, new URL(request.url).origin)
  return rt.routes.entries.delete(request, params as Record<string, string>)
}
