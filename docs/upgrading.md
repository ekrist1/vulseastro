# Upgrading

How to pull a new Vulse version into your Astro project and apply any new migrations.

## Routine upgrade

```bash
pnpm update vulse
npx vulse migrate                                        # local D1
npx vulse migrate --remote -c wrangler.production.toml   # production D1
```

After the install you should:

1. Restart your dev server (Astro picks up changes to integrations only on startup).
2. Check the [release notes](https://github.com/vulsecms/vulse/releases) for breaking changes.
3. Re-build before deploying:

   ```bash
   pnpm build
   ```

## Migrations

Migrations are bundled into the Vulse package and shipped with each release. They are forward-only.

The runtime does **not** apply them — `vulse migrate` is the only thing that does. After upgrading the package, run it against every database (local and production) before deploying code that expects the new tables.

### What `vulse migrate` does

1. Ensures your wrangler config points `migrations_dir` at the bundled SQL files (`node_modules/@vulsecms/core/migrations/`).
2. Runs `wrangler d1 migrations apply DB --local|--remote`, which executes each not-yet-applied file and records it in wrangler's `d1_migrations` ledger table.

### Targeting

```bash
npx vulse migrate                                        # local miniflare D1
npx vulse migrate --remote                               # remote D1 of the default config
npx vulse migrate --remote -c wrangler.production.toml   # production D1 in your Cloudflare account
```

Without `-c` (or `WRANGLER_CONFIG`), the command reads the auto-detected `wrangler.toml` to find the binding — so `--remote` targets *its* `database_id`. If you keep a separate `wrangler.production.toml`, pass `-c wrangler.production.toml` so migrations apply to production. See [`deployment.md`](deployment.md).

### Listing what's bundled

The current shipped set is in [`directory-structure.md`](directory-structure.md#migrations). The ledger in your DB will tell you what's already been applied:

```bash
wrangler d1 execute DB --local --command "SELECT id, applied_at FROM _vulse_migrations ORDER BY id;"
```

## Backwards-compatible upgrades

Most releases either add new tables, add columns with safe defaults, or refactor application code. They do not require data migration.

In rare cases, an upgrade reshapes existing tables. When that happens:

- The release notes will say so explicitly.
- A bundled SQL migration handles the schema change.
- The package versioning will reflect a breaking change.

## When the install hook missed something

If you installed Vulse manually, or you upgraded across a version that introduced new scaffolded files (for example `src/content.config.ts`), you may need to re-run pieces of the install:

```bash
# Re-add the Cloudflare adapter if missing
pnpm astro add cloudflare

# Re-add Vulse (this is idempotent for already-installed packages, but it does
# re-run the integration's install hook to patch wrangler.toml and tsconfig.json).
pnpm astro add @vulsecms/core
```

## After upgrading: re-scaffold collection pages?

If you used `vulse collection:scaffold` earlier, you do **not** need to re-run it after an upgrade. The generated Astro pages and `content.config.ts` are yours to maintain. The CLI takes a `--force` flag to overwrite them if you want fresh templates:

```bash
npx vulse collection:scaffold blog --force
```

See [`cli.md`](cli.md) for the full CLI reference.

## Rolling back

D1 has no built-in down-migrations. If you need to roll back:

1. Restore the D1 database from a Cloudflare backup (production), or wipe the local D1 file and re-migrate to an earlier Vulse version (dev).
2. Re-install the previous Vulse version:

   ```bash
   pnpm install vulse@<previous-version>
   ```

3. Apply the older migration set (`npx vulse migrate`) — already-applied IDs are skipped.

If you only need to roll back code (no schema change involved), `pnpm install vulse@<previous-version>` is enough.
