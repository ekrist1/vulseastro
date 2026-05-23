import { createDb } from '../core/db.js'
import { createAuth } from './better-auth.js'
import { BlueprintRegistry } from '../core/blueprints/registry.js'
import { entriesRoutes } from './routes/entries.js'
import { revisionsRoutes } from './routes/revisions.js'
import { usersRoutes } from './routes/users.js'
import type { RuntimeEnv } from './env.js'

export interface VulseRuntime {
  db: ReturnType<typeof createDb>
  auth: ReturnType<typeof createAuth>
  registry: BlueprintRegistry
  routes: {
    entries: ReturnType<typeof entriesRoutes>
    revisions: ReturnType<typeof revisionsRoutes>
    users: ReturnType<typeof usersRoutes>
  }
}

let cached: VulseRuntime | null = null

export async function getRuntime(env: RuntimeEnv, registry: BlueprintRegistry, baseURL: string): Promise<VulseRuntime> {
  if (cached) return cached
  const db = createDb(env.DB)
  const auth = createAuth(db, {
    baseURL: env.BETTER_AUTH_URL ?? baseURL,
    secret: env.BETTER_AUTH_SECRET,
    allowSignUp: true,
  })
  cached = {
    db, auth, registry,
    routes: {
      entries: entriesRoutes(db, auth, registry),
      revisions: revisionsRoutes(db, auth),
      users: usersRoutes(db, auth),
    },
  }
  return cached
}

export function _resetRuntime(): void { cached = null }

export type { RuntimeEnv } from './env.js'
