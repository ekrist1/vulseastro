#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
program.name('vulse').description('Vulse CMS command-line tools').version('0.0.0')

program
  .command('migrate')
  .description('Apply Drizzle migrations to the configured D1 database')
  .option('--remote', 'Run against the remote D1 instead of local miniflare', false)
  .action(async (opts) => {
    const { runMigrate } = await import('./migrate.js')
    await runMigrate({ remote: !!opts.remote })
  })

program
  .command('seed:admin')
  .description('Create the first admin user')
  .option('--email <email>', 'Admin email (required)')
  .option('--password <password>', 'Password (generated if omitted)')
  .option('--remote', 'Run against the remote D1', false)
  .action(async (opts) => {
    const { runSeedAdmin } = await import('./seed-admin.js')
    await runSeedAdmin({
      email: opts.email,
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      remote: !!opts.remote,
    })
  })

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
