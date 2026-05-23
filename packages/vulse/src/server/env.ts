import { env as cfEnv } from 'cloudflare:workers'

export interface RuntimeEnv {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
}

export function getRuntimeEnv(): RuntimeEnv {
  const env = cfEnv as RuntimeEnv
  if (!env.DB) throw new Error('Vulse: D1 binding "DB" is missing. Add it to wrangler.toml.')
  if (!env.BETTER_AUTH_SECRET) throw new Error('Vulse: BETTER_AUTH_SECRET missing from wrangler.toml [vars].')
  return env
}
