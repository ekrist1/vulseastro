import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../migrations')

export interface MigrateOptions { remote?: boolean }

export async function runMigrate(opts: MigrateOptions): Promise<void> {
  const flag = opts.remote ? '--remote' : '--local'
  const cmd = `wrangler d1 migrations apply DB ${flag} --migrations-dir "${MIGRATIONS_DIR}"`
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}
