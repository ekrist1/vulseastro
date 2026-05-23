import { getRuntimeEnv } from '../env.js'
import { createDb } from '../../core/db.js'
import { registryForRequest } from '../../core/blueprints/load.js'
import { getRuntime } from '../runtime.js'

export async function withRuntime(request: Request) {
  const env = getRuntimeEnv()
  const db = createDb(env.DB)
  const registry = await registryForRequest(db)
  return getRuntime(env, registry, new URL(request.url).origin)
}
