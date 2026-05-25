import { execSync } from 'node:child_process'
import { ensureWranglerConfig } from '../integration/wrangler-config.js'

export interface MigrateOptions { remote?: boolean }

export async function runMigrate(opts: MigrateOptions): Promise<void> {
  const file = await ensureWranglerConfig(process.cwd())
  if (!file) {
    throw new Error('Vulse: no wrangler config found. Run `vulse setup` first to create one.')
  }
  const flag = opts.remote ? '--remote' : '--local'
  const cmd = `wrangler d1 migrations apply DB ${flag}`
  console.log(`> ${cmd}  (migrations: node_modules/@vulsecms/core/migrations via ${file})`)
  execSync(cmd, { stdio: 'inherit' })
}
