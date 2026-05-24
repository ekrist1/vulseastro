# CLI reference

The `vulse` CLI is installed with the package. Run it from the root of your Astro project (where `wrangler.toml` lives) using `npx`:

```bash
npx vulse <command> [options]
```

All commands shell out to `wrangler` for D1 access. Make sure `wrangler` is logged in and `wrangler.toml` has a `DB` binding.

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
