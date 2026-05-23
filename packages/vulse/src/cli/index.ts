#!/usr/bin/env node
import { Command } from 'commander'
import { runMigrate } from './migrate.js'
import { runSeedAdmin } from './seed-admin.js'

const program = new Command()
program.name('vulse').description('Vulse CMS command-line tools').version('0.0.0')

program
  .command('migrate')
  .description('Apply Drizzle migrations to the configured D1 database')
  .option('--remote', 'Run against the remote D1 instead of local miniflare', false)
  .action(async (opts) => { await runMigrate({ remote: !!opts.remote }) })

program
  .command('seed:admin')
  .description('Create the first admin user (interactive)')
  .option('--email <email>', 'Admin email (skips prompt)')
  .option('--remote', 'Run against the remote D1', false)
  .action(async (opts) => { await runSeedAdmin({ email: opts.email, remote: !!opts.remote }) })

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
