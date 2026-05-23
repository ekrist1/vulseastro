import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Walk up from cwd to find wrangler.toml (same resolution wrangler uses). */
export async function findWranglerConfig(cwd = process.cwd()): Promise<string> {
  let dir = cwd
  for (;;) {
    const configPath = join(dir, 'wrangler.toml')
    if (await fileExists(configPath)) return configPath
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error('No wrangler.toml found. Run this command from your Astro project root.')
    }
    dir = parent
  }
}

export interface CliPlatform {
  db: D1Database
  env: Record<string, unknown>
  dispose: () => Promise<void>
}

/** Resolves the D1 binding via wrangler (local miniflare or remote). */
export async function resolveCliPlatform(opts: { remote?: boolean } = {}): Promise<CliPlatform> {
  const configPath = await findWranglerConfig()
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    configPath,
    remoteBindings: !!opts.remote,
  })
  const db = proxy.env.DB as D1Database | undefined
  if (!db) throw new Error('D1 binding "DB" not found in wrangler.toml')
  return { db, env: proxy.env as Record<string, unknown>, dispose: proxy.dispose }
}
