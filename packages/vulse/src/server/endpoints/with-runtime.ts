import { getRuntimeEnv } from '../env.js'
import { createDb } from '../../core/db.js'
import { registryForRequest } from '../../core/blueprints/load.js'
import { getRuntime } from '../runtime.js'

export async function withRuntime(request: Request) {
  const env = getRuntimeEnv()
  return getRuntime(env, () => registryForRequest(createDb(env.DB)), new URL(request.url).origin)
}
