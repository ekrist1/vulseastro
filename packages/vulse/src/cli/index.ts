#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
program.name('vulse').description('Vulse CMS command-line tools').version('0.0.0')

program
  .command('setup')
  .description('Interactive first-run setup: configure D1, R2, secrets, run migrations, seed admin')
  .option('-y, --yes', 'Accept all defaults and skip prompts', false)
  .option('--email <email>', 'Admin email for the seeded user')
  .option('--password <password>', 'Admin password (generated if omitted)')
  .option('--skip-migrate', 'Skip running migrations', false)
  .option('--skip-seed', 'Skip seeding the first admin user', false)
  .action(async (opts) => {
    const { runSetup } = await import('./setup.js')
    await runSetup({
      yes: !!opts.yes,
      ...(opts.email !== undefined ? { email: opts.email } : {}),
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      skipMigrate: !!opts.skipMigrate,
      skipSeed: !!opts.skipSeed,
    })
  })

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

program
  .command('collection:scaffold <handle>')
  .description('Scaffold a code blueprint, Astro index/show pages, and content.config entry')
  .option('--route <path>', 'Show route template, e.g. /blog/{slug}')
  .option('--index <path>', 'Index route, e.g. /blog (omit for show-only)')
  .option('--label <label>', 'Collection label for generated files')
  .option('--title-field <field>', 'Title field used in templates')
  .option('--force', 'Overwrite existing scaffold files', false)
  .option('--skip-blueprint', 'Skip src/vulse/collections/<handle>.ts', false)
  .option('--skip-pages', 'Skip Astro page files', false)
  .option('--skip-content-config', 'Skip content.config.ts update', false)
  .action(async (handle: string, opts) => {
    const { runCollectionScaffold } = await import('./collection-scaffold.js')
    await runCollectionScaffold({
      handle,
      ...(opts.route !== undefined ? { route: opts.route } : {}),
      ...(opts.index !== undefined ? { index: opts.index } : {}),
      ...(opts.label !== undefined ? { label: opts.label } : {}),
      ...(opts.titleField !== undefined ? { titleField: opts.titleField } : {}),
      force: !!opts.force,
      skipBlueprint: !!opts.skipBlueprint,
      skipPages: !!opts.skipPages,
      skipContentConfig: !!opts.skipContentConfig,
    })
  })

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
