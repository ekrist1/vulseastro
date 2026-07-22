# Deployment

Vulse targets **Cloudflare Workers** with a single artifact: one deploy serves your public site, the admin UI, and the API.

## Dev → production at a glance

`npx vulse setup` created a **development** database and wrote `wrangler.toml` as your dev config. Production uses a separate D1 database — but the **same migrations**, so you never need to recreate or export your schema.

The recommended pattern is two committed config files:

| File | Used for |
|------|----------|
| `wrangler.toml` | Local development (`pnpm dev`) |
| `wrangler.production.toml` | Production builds and deploys |

**You never overwrite `wrangler.toml`.** Point the build at the production config with the `WRANGLER_CONFIG` environment variable, deploy the generated config, and migrate with `-c`:

```bash
npx vulse migrate --remote -c wrangler.production.toml   # schema → prod D1
WRANGLER_CONFIG=wrangler.production.toml pnpm build       # build against prod config
wrangler deploy -c dist/server/wrangler.json              # deploy the generated config
```

No file swapping, no restore step, nothing to forget. Your dev `wrangler.toml` is untouched, so `pnpm dev` keeps working immediately afterwards.

This requires one line in `astro.config.mjs` so the adapter reads `WRANGLER_CONFIG` when set (see [Wire up `configPath`](#wire-up-configpath)).

> **Why not the old `cp wrangler.production.toml wrangler.toml` swap?** It worked, but it overwrote your dev config in place — and the `git checkout wrangler.toml` "restore" silently did nothing if the file was gitignored or had uncommitted edits, leaving your dev database pointed at production. The `configPath` approach below removes that footgun entirely. If you're on an older Vulse that lacks the `configPath` line, see [Fallback: the file swap](#fallback-the-file-swap).

> **Why not `[env.production]` sections?** The `@astrojs/cloudflare` adapter resolves a single top-level environment at build time; `[env.*]` blocks are not copied into the generated deploy config. Separate top-level files selected via `configPath` are the reliable alternative. See [Multi-environment](#multi-environment) for CI examples.

> **`wrangler.toml` is not deployed directly.** The adapter reads your wrangler config at **build time** and writes a resolved snapshot to `dist/server/wrangler.json`. You deploy *that* file. Any change to the config — including `database_id` — only takes effect after a rebuild. Always build immediately before `wrangler deploy`.

## Wire up `configPath`

The `@astrojs/cloudflare` adapter accepts a `configPath` option that tells it which wrangler config to read at build time. Wire it to `WRANGLER_CONFIG` so dev auto-detects `wrangler.toml` (variable unset) while production/CI selects the production file:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import vulse from '@vulsecms/core'

export default defineConfig({
  output: 'server',
  integrations: [vulse()],
  adapter: cloudflare(
    process.env.WRANGLER_CONFIG ? { configPath: process.env.WRANGLER_CONFIG } : {},
  ),
})
```

When `WRANGLER_CONFIG` is unset, the adapter falls back to its normal discovery (`wrangler.toml` / `wrangler.jsonc` / `wrangler.json`), so local development is unchanged.

## Production checklist

1. [Create Cloudflare resources](#1-create-resources) — production D1, R2, optional Queue.
2. [Create `wrangler.production.toml`](#2-wranglerproductiontoml) with production IDs.
3. [Run migrations against production D1](#3-migrations).
4. [Set production secrets](#4-secrets).
5. [Seed the production admin](#5-seed-production-admin).
6. [Build and deploy](#6-build-and-deploy).
7. [Wire the scheduled handler (cron)](#cron).
8. [Wire the queue consumer (forms)](#queue-consumer-forms) — if using forms.

## 1. Create resources

```bash
wrangler d1 create vulse-db-prod
wrangler r2 bucket create vulse-media-prod
# Optional — if using forms:
wrangler queues create vulse-form-queue
```

## 2. `wrangler.production.toml`

Create `wrangler.production.toml` in your project root alongside the existing `wrangler.toml` — do **not** overwrite your dev config:

```toml
name = "my-site"
compatibility_date = "2025-10-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "vulse-db-prod"
database_id = "<production-d1-id>"
migrations_dir = "node_modules/@vulsecms/core/migrations"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "vulse-media-prod"

# Optional — Cloudflare Email Routing (password reset + form notifications)
# Requires Email Routing set up for your domain in the Cloudflare dashboard.
[[send_email]]
name = "SEND_EMAIL"

# Optional — Forms queue
[[queues.producers]]
queue = "vulse-form-queue"
binding = "FORM_QUEUE"

[[queues.consumers]]
queue = "vulse-form-queue"
max_batch_size = 10
max_batch_timeout = 30

# Optional — Scheduled cron (every hour)
[triggers]
crons = ["0 * * * *"]

[vars]
EMAIL_FROM = "noreply@yourdomain.com"
```

The `nodejs_compat` flag is required for media uploads.

**Do not set `main` or `assets` yourself.** The `@astrojs/cloudflare` adapter computes both
during `astro build` and writes them into the generated `dist/server/wrangler.json`. (Older
guides reference a single `dist/_worker.js` artifact — that layout no longer applies to this
adapter; the entry is `dist/server/entry.mjs` and assets live in `dist/client/`.) Everything
else above — bindings, `vars`, `database_id`, queues, crons — *is* read from the config the
build selected (`wrangler.toml` by default, or whatever `WRANGLER_CONFIG`/`configPath` points at)
and copied into the generated config.

## 3. Migrations

Apply Vulse's bundled migrations to your production D1. Pass `-c` so migrations target the production database, not your dev one:

```bash
npx vulse migrate --remote -c wrangler.production.toml
```

`-c/--config` selects which wrangler config the migration runs against (it also falls back to the `WRANGLER_CONFIG` environment variable if set). Without it, `--remote` would apply to whatever `database_id` your default `wrangler.toml` points at — i.e. your dev database.

This is idempotent — already-applied migrations are skipped. Migrations are applied **only** by this command (it wraps `wrangler d1 migrations apply`); the runtime never applies them on its own. Skipping this step against a fresh database means the first request fails with `no such table` errors, so run it before every deploy that ships new migrations.

## 4. Secrets

Set these as wrangler secrets (not `[vars]`):

```bash
wrangler secret put BETTER_AUTH_SECRET            # required, 32+ random chars
wrangler secret put VULSE_PREVIEW_SECRET          # optional; falls back to BETTER_AUTH_SECRET
# Cloudflare Images (optional):
wrangler secret put CF_IMAGES_ACCOUNT_HASH
wrangler secret put CF_IMAGES_TOKEN
```

`EMAIL_FROM` (the sending address) is not a secret — put it in `[vars]` in `wrangler.production.toml`. The `SEND_EMAIL` binding handles authentication through Cloudflare's platform; no API token is needed.

Generate a strong `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

## 5. Seed production admin

The same flows work as in [`installation.md#4-seed-your-first-admin`](installation.md#4-seed-your-first-admin):

- **Option B — CLI:**
  ```bash
  npx vulse seed:admin --email you@company.com --remote -c wrangler.production.toml
  ```
  The `--remote` flag targets your live production D1 (requires `wrangler login`). Don't
  omit it — without `--remote` the admin is created in your *local* dev database and
  production login will fail with "Invalid email or password". Pass `-c wrangler.production.toml`
  (or set `WRANGLER_CONFIG`) so `--remote` resolves the production `database_id` rather than
  your dev config's.
- **Option A — Sign-up then promote:**
  Temporarily enable sign-up in production (`PUT /api/vulse/settings/allowMemberSignUp`), create the account, run `UPDATE user SET role='admin'`, and disable sign-up again.

After bootstrap, log in to `/admin/login` and promote any additional admins via **Admin → Users**.

## 6. Build and deploy

Select the production config for the build via `WRANGLER_CONFIG`, then deploy the generated config:

```bash
WRANGLER_CONFIG=wrangler.production.toml pnpm build
wrangler deploy -c dist/server/wrangler.json
```

Your dev `wrangler.toml` is never touched — there is nothing to restore, in CI or locally. (Requires the `configPath` line in `astro.config.mjs`; see [Wire up `configPath`](#wire-up-configpath).)

The build must run **immediately before** the deploy: the production config (including `database_id`) is baked into `dist/server/wrangler.json` at build time, so deploying a stale build ships stale bindings. See [How deploy resolves config](#how-deploy-resolves-config).

> Plain `wrangler deploy` (no `-c`) also works *after a build*, because the adapter writes a
> redirect at `.wrangler/deploy/config.json` that points wrangler at the generated config.
> Passing `-c dist/server/wrangler.json` explicitly is more robust — it deploys the right
> config even if `.wrangler/` was cleaned, gitignored, or never generated.

## How deploy resolves config

`astro build` (via `@astrojs/cloudflare`) produces:

```
dist/
├── server/
│   ├── entry.mjs        # the Worker entry (this is `main`)
│   └── wrangler.json    # generated deploy config — merges your wrangler.toml + computed main/assets
├── client/              # static assets (served via the ASSETS binding)
└── .wrangler/deploy/config.json   # redirect: tells `wrangler deploy` to use dist/server/wrangler.json
```

`dist/server/wrangler.json` is a **point-in-time snapshot** of the config the build read (your
`wrangler.toml`, or whatever `WRANGLER_CONFIG`/`configPath` selected), with `main`, `assets`, and
the resolved bindings filled in. `wrangler deploy` reads this file, not your source config. That is why:

- **Editing the config has no effect on a deploy until you rebuild.** A wrong/placeholder
  `database_id` in a stale build will deploy a Worker bound to the wrong D1, even though the
  source config looks correct.
- **`npx vulse migrate -c <config>` reads that config live**, while `wrangler deploy` reads the
  build snapshot. If the build used a *different* config than the migrate step, migrations can hit
  one database while the deployed Worker points at another. Keep them in sync: use the same
  config file for both (`WRANGLER_CONFIG=…pnpm build` and `vulse migrate -c …`) and rebuild before
  every deploy.

If you're using Cloudflare Pages, point Pages at your repo and let it run `pnpm build` — the CI
environment needs the same bindings configured in the Pages dashboard. Set `WRANGLER_CONFIG`
in the Pages build environment to select the production config. Because CI builds and deploys
in the same job, the generated config and redirect are always fresh.

## Copying data to production

Migrations move your **schema** to production; they do not move **rows**. The first deploy of a
brand-new site usually needs no data copy — you create content in production directly. But if
you've been authoring locally and want to seed production with that content, copy the data with
D1's export/import.

> **Importing overwrites.** `wrangler d1 export` produces SQL `INSERT` statements; importing them
> into a database that already has rows can collide on primary keys or duplicate content. Treat
> import as a **one-time seed of an empty production database**, not an ongoing sync. Take a fresh
> export of production first (below) if there's any chance it already holds data you care about.

**1. Export your local database to a SQL file.** The local D1 lives in Miniflare under `.wrangler/`:

```bash
wrangler d1 export DB --local --output local-data.sql
```

To export only data (skip the schema, since migrations already created it), add `--no-schema`:

```bash
wrangler d1 export DB --local --no-schema --output local-data.sql
```

**2. Apply migrations to production first** (so the tables exist), if you haven't already:

```bash
npx vulse migrate --remote -c wrangler.production.toml
```

**3. Import into the production database.** Point the command at the production config so it
resolves the right `database_id`:

```bash
wrangler d1 execute DB --remote -c wrangler.production.toml --file local-data.sql
```

**4. Re-upload media (R2 is separate from D1).** D1 export only carries database rows — the
`media` table's *metadata*, not the asset bytes in R2. Mirror your local bucket into the
production bucket so the referenced files resolve:

```bash
# List/copy objects from the dev bucket to the prod bucket. For small libraries,
# download then re-upload; for larger ones use `rclone` against the R2 S3 API.
wrangler r2 object get vulse-media/<key> --file /tmp/<key>
wrangler r2 object put vulse-media-prod/<key> --file /tmp/<key>
```

> Backup direction works the same way: `wrangler d1 export DB --remote -c wrangler.production.toml
> --output prod-backup.sql` pulls a full production snapshot you can keep or restore locally.

## Cron

A scheduled handler purges:

- Soft-deleted media older than 7 days.
- Expired preview sessions (TTL 1 hour each).
- Orphan form-upload drafts.

Wire it from your worker entry:

```ts
// src/worker.ts (the file `main` points to)
import { vulseScheduled } from '@vulsecms/core/integration/cron'

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(vulseScheduled(env))
  },
}
```

Add a cron trigger in `wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]   # every hour
```

The handler is idempotent and safe to run more frequently if you prefer.

## Queue consumer (forms)

Form submissions are stored synchronously, but notifications, webhooks, and queued plugin hooks run in a queue consumer:

```ts
// src/worker.ts
import { vulseFormQueue, vulseScheduled } from '@vulsecms/core/server'

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(vulseScheduled(env))
  },
  async queue(batch, env) {
    await vulseFormQueue(batch, env)
  },
}
```

Without a `FORM_QUEUE` binding, submissions still land in D1 but async side-effects don't run. See [`forms.md`](forms.md#async-processing-form_queue).

## Custom domain

```bash
wrangler deployments domains add your-domain.com
```

Or attach the custom domain through the Cloudflare dashboard. `BETTER_AUTH_URL` defaults to the request origin and adapts automatically.

## Verifying a deploy

After `wrangler deploy -c dist/server/wrangler.json`:

- `https://your-domain.com/` should render your site.
- `https://your-domain.com/admin/login` should serve the admin sign-in.
- `https://your-domain.com/api/vulse/public/globals` should return `{"ok":true,"data":{}}` (or your defined globals).
- Sign in and create a test entry; confirm it appears at the public URL.
- If using forms, submit a test form and check it appears in **Admin → Forms → Submissions**.

## Rolling back

Wrangler keeps previous deployments. Roll back the worker code with:

```bash
wrangler rollback <deployment-id>
```

For schema rollbacks, see [`upgrading.md#rolling-back`](upgrading.md#rolling-back). D1 has no built-in down-migrations.

## Scaling notes

- **D1** rows are billed per read/write; the schema indexes typical access patterns (per-collection lists, slug lookups, FTS) so you usually pay one or two D1 reads per page.
- **R2** is billed per request and per GB stored. The media table tracks `deleted_at`; the cron handler hard-purges after 7 days.
- **Queues** have a free tier of 1M messages/month; one form submission = one message.
- **CPU time** — most read paths are O(small number of D1 queries). The Content Layer loader pulls everything at sync time so the public site has no D1 reads on cache hits.

## Multi-environment

Keep one complete top-level config file per environment (not `[env.*]` sections, which the `@astrojs/cloudflare` adapter does not forward into the generated deploy config):

```
wrangler.toml               # dev — used by pnpm dev and `vulse migrate` (local)
wrangler.staging.toml       # staging — committed, selected via WRANGLER_CONFIG
wrangler.production.toml    # production — committed, selected via WRANGLER_CONFIG
```

Each file is a standalone top-level config with its own `name`, `database_id`, and R2 bucket. Select one per job with `WRANGLER_CONFIG` (build) and `-c` (migrate) — no swapping:

```bash
# Staging job
npx vulse migrate --remote -c wrangler.staging.toml
WRANGLER_CONFIG=wrangler.staging.toml pnpm build
wrangler deploy -c dist/server/wrangler.json

# Production job
npx vulse migrate --remote -c wrangler.production.toml
WRANGLER_CONFIG=wrangler.production.toml pnpm build
wrangler deploy -c dist/server/wrangler.json
```

Because nothing overwrites `wrangler.toml`, the same checkout can build any environment, and local `pnpm dev` keeps using the dev config throughout.

## Fallback: the file swap

Older Vulse projects (before `astro.config.mjs` wired `configPath`) selected the config by copying it over `wrangler.toml`. If you can't add the [`configPath` line](#wire-up-configpath) for some reason, you can still swap — but do it **safely**, with a backup and a `trap` that restores even if the build fails:

```bash
cp wrangler.toml wrangler.toml.bak                 # back up the real dev config
trap 'mv wrangler.toml.bak wrangler.toml' EXIT     # always restore, even on error
cp wrangler.production.toml wrangler.toml
pnpm build
wrangler deploy -c dist/server/wrangler.json
npx vulse migrate --remote                          # reads the swapped-in production config
```

Avoid `git checkout wrangler.toml` as the restore step: it silently does nothing if `wrangler.toml` is gitignored or has uncommitted local edits, which can leave your dev config pointing at production. Prefer `configPath` — it removes the swap (and this footgun) entirely.
