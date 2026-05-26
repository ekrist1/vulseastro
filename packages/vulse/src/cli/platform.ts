import { resolveWranglerConfigPath } from '../integration/wrangler-config.js'

/** Walk up from cwd to find wrangler.jsonc, wrangler.toml, or wrangler.json. */
export async function findWranglerConfig(cwd = process.cwd()): Promise<string> {
  return resolveWranglerConfigPath(cwd)
}

export interface CliPlatform {
  db: D1Database
  env: Record<string, unknown>
  dispose: () => Promise<void>
}

/** Resolves the D1 binding via wrangler (local miniflare or remote). */
export async function resolveCliPlatform(opts: { remote?: boolean } = {}): Promise<CliPlatform> {
  const configPath = await resolveWranglerConfigPath()
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    configPath,
    remoteBindings: !!opts.remote,
  })
  const db = proxy.env.DB as D1Database | undefined
  if (!db) throw new Error('D1 binding "DB" not found in wrangler config')
  return { db, env: proxy.env as Record<string, unknown>, dispose: proxy.dispose }
}
