import { execSync } from 'node:child_process'
import { ensureWranglerConfig } from '../integration/wrangler-config.js'

export interface MigrateOptions {
  remote?: boolean
  /** Wrangler config to target (e.g. `wrangler.production.toml`). Falls back to `WRANGLER_CONFIG`. */
  config?: string
}

export async function runMigrate(opts: MigrateOptions): Promise<void> {
  const configFile = opts.config ?? process.env.WRANGLER_CONFIG
  const file = await ensureWranglerConfig(process.cwd(), undefined, configFile)
  if (!file) {
    throw new Error('Vulse: no wrangler config found. Run `vulse setup` first to create one.')
  }
  const flag = opts.remote ? '--remote' : '--local'
  const configFlag = configFile ? ` -c ${configFile}` : ''
  const cmd = `wrangler d1 migrations apply DB ${flag}${configFlag}`
  console.log(`> ${cmd}  (migrations: node_modules/@vulsecms/core/migrations via ${file})`)
  execSync(cmd, { stdio: 'inherit' })
}
