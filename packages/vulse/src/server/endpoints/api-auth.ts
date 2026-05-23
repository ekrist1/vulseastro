import type { APIRoute } from 'astro'
import { getRuntime } from '../runtime.js'
import { registryFromUserCollections } from '../../core/blueprints/load.js'
import { getRuntimeEnv } from '../env.js'

export const ALL: APIRoute = async ({ request }) => {
  const env = getRuntimeEnv()
  const rt = await getRuntime(env, await registryFromUserCollections(), new URL(request.url).origin)
  return rt.auth.handler(request)
}

export const GET = ALL
export const POST = ALL
