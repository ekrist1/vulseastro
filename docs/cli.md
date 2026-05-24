# CLI reference

The `vulse` CLI is installed with the package. Run it from the root of your Astro project (where `wrangler.toml` lives) using `npx`:

```bash
npx vulse <command> [options]
```

All commands shell out to `wrangler` for D1 access. Make sure `wrangler` is logged in and `wrangler.toml` has a `DB` binding.

## `vulse setup`

Interactive first-run setup. Walks you through configuring D1, R2, and the local secrets needed to bring Vulse up — without hand-editing `wrangler.toml` or `.dev.vars`.

```bash
npx vulse setup
```

What it does, in order:

1. Patches `wrangler.toml` with the D1 (`DB`) and R2 (`BUCKET`) bindings (uses the same logic as the `astro add @ekrist1/vulse` install hook).
2. Optionally runs `wrangler d1 create <name>` and splices the returned `database_id` into `wrangler.toml`. If the create call fails or you already have a database, you can paste the id manually.
3. Optionally runs `wrangler r2 bucket create <name>`. Existing buckets are detected and reused.
4. Generates `BETTER_AUTH_SECRET` and `VULSE_PREVIEW_SECRET` (32 random bytes each, hex-encoded) and writes them to `.dev.vars`. Existing values in `.dev.vars` are preserved.
5. Adds `.dev.vars` to `.gitignore` if not already ignored.
6. Runs `vulse migrate` against local D1.
7. Prompts for an admin email and runs `vulse seed:admin`, printing the generated password.

| Flag | Purpose |
|------|---------|
| `-y`, `--yes` | Accept all defaults and skip prompts (CI-friendly). |
| `--email <addr>` | Admin email — skips the prompt in step 7. |
| `--password <pw>` | Admin password — otherwise a random one is generated and printed. |
| `--skip-migrate` | Skip step 6. |
| `--skip-seed` | Skip step 7. |

The wizard is **local-development only**. It does not push secrets to Cloudflare — for production secrets, use `wrangler secret put` (see [`deployment.md`](deployment.md)).

The wizard is idempotent: re-running it on a configured project is safe. Existing `database_id`, secrets, and bindings are kept; only missing pieces are filled in.

### Non-interactive example

```bash
npx vulse setup --yes --email admin@example.com --password 'your-secure-password'
```

This uses `vulse-db` and `vulse-media` as default names, generates secrets, and seeds the admin without any prompts.

## `vulse migrate`

Apply bundled migrations to D1.

```bash
npx vulse migrate              # local miniflare D1
npx vulse migrate --remote     # production D1
```

The command:

1. Connects to the `DB` binding via wrangler.
2. Ensures the `_vulse_migrations` ledger table exists.
3. Runs every bundled migration that isn't already recorded.

Already-applied IDs are skipped, so re-running is safe.

See [`upgrading.md#migrations`](upgrading.md#migrations) for more context.

## `vulse seed:admin`

Create or promote a user to the `admin` role. Useful for bootstrapping the first admin without enabling public sign-up.

```bash
npx vulse seed:admin --email you@example.com
npx vulse seed:admin --email you@example.com --remote
npx vulse seed:admin --email you@example.com --password 'your-secure-password'
```

| Flag | Purpose |
|------|---------|
| `--email <addr>` | Required. The user's email. |
| `--password <pw>` | Optional. If omitted, a random password is generated and printed once. |
| `--remote` | Target the production D1 instead of local. |

The command creates the user via Better Auth (proper password hashing) and updates `role = 'admin'`. If a user with that email already exists, it just promotes them.

The seed always runs migrations first, so it's safe to run on a fresh database.

## `vulse collection:scaffold`

Generate Astro page templates and a Content Layer loader entry for a collection.

```bash
npx vulse collection:scaffold blog \
  --route '/blog/{slug}' \
  --index '/blog'
```

| Output | Purpose |
|--------|---------|
| `src/vulse/collections/<handle>.ts` | Code blueprint with `preview.path` and starter access rules |
| `src/pages/<segment>/[slug].astro` | Entry detail page using the runtime SDK |
| `src/pages/<segment>/index.astro` | Listing page using `getCollection` — only when `--index` is set |
| `src/content.config.ts` | Adds a `vulseLoader()` entry. Merged into the existing file if one exists. |

### Options

| Flag | Purpose |
|------|---------|
| `--route <pattern>` | URL pattern for the detail page. Use `{slug}` as the placeholder. Defaults to `/<handle>/{slug}`. |
| `--index <path>` | Generate a listing page at `<path>/index.astro`. Omit to skip. |
| `--force` | Overwrite existing files. Without it, the CLI refuses to clobber. |
| `--skip-blueprint` | Don't write the blueprint file (use when the blueprint already exists). |
| `--skip-loader` | Don't touch `src/content.config.ts`. |
| `--skip-pages` | Don't write Astro page templates. |
| `--remote` | Apply against production D1 (rarely needed — scaffolding is local-only). |

### Examples

```bash
# Show pages only at the site root:
npx vulse collection:scaffold page --route '/{slug}'

# Refresh the templates from the current Vulse version:
npx vulse collection:scaffold blog --force

# Only update content.config.ts, leave pages alone:
npx vulse collection:scaffold blog --skip-blueprint --skip-pages
```

Restart your dev server after scaffolding so Astro picks up the new pages and loader.

## `vulse --help`

```bash
npx vulse --help
npx vulse setup --help
npx vulse migrate --help
npx vulse seed:admin --help
npx vulse collection:scaffold --help
```

Each subcommand prints its flags.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Validation error (bad flags, target file exists without `--force`, etc.) |
| `2` | Runtime error (wrangler failed, D1 unreachable) |

The CLI prints actionable error messages — capture stderr in CI if you need to log them.
