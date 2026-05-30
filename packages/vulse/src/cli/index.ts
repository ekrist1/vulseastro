#!/usr/bin/env node
import { Command } from 'commander'
import { VULSE_VERSION } from '../version.js'

const program = new Command()
program.name('vulse').description('Vulse CMS command-line tools').version(VULSE_VERSION)

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
  .option('-c, --config <path>', 'Wrangler config to target (e.g. wrangler.production.toml); defaults to WRANGLER_CONFIG or auto-detected')
  .action(async (opts) => {
    const { runMigrate } = await import('./migrate.js')
    await runMigrate({
      remote: !!opts.remote,
      ...(opts.config !== undefined ? { config: opts.config } : {}),
    })
  })

program
  .command('seed:admin')
  .description('Create the first admin user')
  .option('--email <email>', 'Admin email (required)')
  .option('--password <password>', 'Password (generated if omitted)')
  .option('--remote', 'Run against the remote D1', false)
  .option('-c, --config <path>', 'Wrangler config to target (e.g. wrangler.production.toml); defaults to WRANGLER_CONFIG or auto-detected')
  .action(async (opts) => {
    const { runSeedAdmin } = await import('./seed-admin.js')
    await runSeedAdmin({
      email: opts.email,
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      remote: !!opts.remote,
      ...(opts.config !== undefined ? { config: opts.config } : {}),
    })
  })

program
  .command('collection:scaffold <handle>')
  .description('Scaffold a code blueprint and SSR Astro index/show pages (optional Content Layer loader with --static)')
  .option('--route <path>', 'Show route template, e.g. /blog/{slug}')
  .option('--index <path>', 'Index route, e.g. /blog (omit for show-only)')
  .option('--label <label>', 'Collection label for generated files')
  .option('--title-field <field>', 'Title field used in templates')
  .option('--framework <framework>', "Show page target: 'astro' (default) or 'vue'", 'astro')
  .option('--vue', 'Shorthand for --framework vue', false)
  .option('--static', 'Add vulseLoader() to content.config.ts for SSG getCollection()', false)
  .option('--force', 'Overwrite existing scaffold files', false)
  .option('--skip-blueprint', 'Skip src/vulse/collections/<handle>.ts', false)
  .option('--skip-pages', 'Skip Astro page files', false)
  .option('--skip-content-config', 'Skip content.config.ts even when --static is set', false)
  .action(async (handle: string, opts) => {
    const { runCollectionScaffold } = await import('./collection-scaffold.js')
    await runCollectionScaffold({
      handle,
      ...(opts.route !== undefined ? { route: opts.route } : {}),
      ...(opts.index !== undefined ? { index: opts.index } : {}),
      ...(opts.label !== undefined ? { label: opts.label } : {}),
      ...(opts.titleField !== undefined ? { titleField: opts.titleField } : {}),
      framework: opts.vue ? 'vue' : (opts.framework ?? 'astro'),
      force: !!opts.force,
      static: !!opts.static,
      skipBlueprint: !!opts.skipBlueprint,
      skipPages: !!opts.skipPages,
      skipContentConfig: !!opts.skipContentConfig,
    })
  })

program
  .command('schema:export')
  .description('Generate AGENTS.md and docs/vulse-schema.* for AI-assisted frontend development')
  .option('--remote', 'Read schema from production D1 instead of local miniflare', false)
  .option('--out-dir <dir>', 'Directory for vulse-schema.md/json (default: docs)')
  .option('-c, --config <path>', 'Wrangler config to target (e.g. wrangler.production.toml); defaults to WRANGLER_CONFIG or auto-detected')
  .action(async (opts) => {
    const { runSchemaExport } = await import('./schema-export.js')
    await runSchemaExport({
      remote: !!opts.remote,
      ...(opts.outDir !== undefined ? { docsDir: opts.outDir } : {}),
      ...(opts.config !== undefined ? { config: opts.config } : {}),
    })
  })

program
  .command('theme:add [key]')
  .description('Install a predefined, design-token-driven Astro theme into your project')
  .option('--list', 'List the available built-in themes', false)
  .option('--force', 'Overwrite existing files', false)
  .option('--dir <dir>', 'Install under a subdirectory of cwd (default: project root)')
  .action(async (key: string | undefined, opts) => {
    const { runThemeAdd } = await import('./theme-add.js')
    await runThemeAdd({
      ...(key !== undefined ? { key } : {}),
      list: !!opts.list,
      force: !!opts.force,
      ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
  .command('schema:import [file]')
  .description('Import collection blueprints from a JSON bundle, or a built-in --template')
  .option('--template <key>', 'Import a built-in template by key (see --list)')
  .option('--list', 'List the available built-in templates', false)
  .option('--remote', 'Run against the remote D1 instead of local miniflare', false)
  .option('-c, --config <path>', 'Wrangler config to target (e.g. wrangler.production.toml); defaults to WRANGLER_CONFIG or auto-detected')
  .action(async (file: string | undefined, opts) => {
    const { runSchemaImport } = await import('./schema-import.js')
    await runSchemaImport({
      ...(file !== undefined ? { file } : {}),
      ...(opts.template !== undefined ? { template: opts.template } : {}),
      list: !!opts.list,
      remote: !!opts.remote,
      ...(opts.config !== undefined ? { config: opts.config } : {}),
    })
  })

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
