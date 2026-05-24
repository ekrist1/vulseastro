import { execSync } from 'node:child_process'
import { ensureWranglerConfig } from '../integration/wrangler-config.js'

export interface MigrateOptions { remote?: boolean }

export async function runMigrate(opts: MigrateOptions): Promise<void> {
  const file = await ensureWranglerConfig(process.cwd())
  const flag = opts.remote ? '--remote' : '--local'
  const cmd = `wrangler d1 migrations apply DB ${flag}`
  console.log(`> ${cmd}  (migrations: node_modules/@ekrist1/vulse/migrations via ${file})`)
  execSync(cmd, { stdio: 'inherit' })
}
