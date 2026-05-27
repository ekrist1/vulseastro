import { readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
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

/**
 * Flag the Vulse D1 binding (`DB`) as `remote` in a wrangler config's text.
 *
 * `getPlatformProxy({ remoteBindings: true })` only routes a binding to the remote
 * resource when that binding is itself marked `remote` in the config — otherwise it
 * silently uses the local Miniflare D1. For `--remote` CLI runs we patch a temp copy
 * of the config so the proxy actually targets the production database. Only the `DB`
 * binding is touched; everything else (database_id, vars, other bindings) is preserved.
 * Idempotent.
 */
export function markD1BindingRemote(content: string, isToml: boolean): string {
  if (isToml) {
    if (/binding\s*=\s*"DB"[\s\S]{0,300}?remote\s*=\s*true/.test(content)) return content
    return content.replace(/(binding\s*=\s*"DB")/, '$1\nremote = true')
  }
  if (/"binding"\s*:\s*"DB"[\s\S]{0,300}?"remote"\s*:\s*true/.test(content)) return content
  return content.replace(/("binding"\s*:\s*"DB")/, '$1, "remote": true')
}

/** Resolves the D1 binding via wrangler (local miniflare or remote). */
export async function resolveCliPlatform(opts: { remote?: boolean } = {}): Promise<CliPlatform> {
  const configPath = await resolveWranglerConfigPath()
  const { getPlatformProxy } = await import('wrangler')

  // For --remote, point the proxy at a temp config with the DB binding flagged remote
  // (written alongside the original so relative paths still resolve). remoteBindings
  // alone is not enough — the binding itself must opt in, or D1 stays local.
  let effectiveConfigPath = configPath
  let cleanupTemp: (() => Promise<void>) | null = null
  if (opts.remote) {
    const ext = extname(configPath) || '.json'
    const original = await readFile(configPath, 'utf8')
    const patched = markD1BindingRemote(original, ext === '.toml')
    const tempPath = join(dirname(configPath), `.vulse-remote.tmp${ext}`)
    await writeFile(tempPath, patched, 'utf8')
    effectiveConfigPath = tempPath
    cleanupTemp = async () => { try { await unlink(tempPath) } catch { /* already gone */ } }
  }

  try {
    const proxy = await getPlatformProxy({
      configPath: effectiveConfigPath,
      remoteBindings: !!opts.remote,
    })
    const db = proxy.env.DB as D1Database | undefined
    if (!db) {
      await cleanupTemp?.()
      throw new Error('D1 binding "DB" not found in wrangler config')
    }
    return {
      db,
      env: proxy.env as Record<string, unknown>,
      dispose: async () => {
        await proxy.dispose()
        await cleanupTemp?.()
      },
    }
  } catch (err) {
    await cleanupTemp?.()
    throw err
  }
}
