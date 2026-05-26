# Deployment

Vulse targets **Cloudflare Workers** with a single artifact: one deploy serves your public site, the admin UI, and the API.

## Production checklist

1. [Create Cloudflare resources](#1-create-resources) — production D1, R2, optional Queue.
2. [Update `wrangler.toml`](#2-wranglertoml) with production IDs.
3. [Run migrations against production D1](#3-migrations).
4. [Set production secrets](#4-secrets).
5. [Seed the production admin](#5-seed-production-admin).
6. [Build and deploy](#6-build-and-deploy).
7. [Wire the scheduled handler (cron)](#cron).
8. [Wire the queue consumer (forms)](#queue-consumer-forms) — if using forms.

> **Important — your `wrangler.toml` is not deployed directly.** The `@astrojs/cloudflare`
> adapter reads `wrangler.toml` at **build time** and writes a fully-resolved deploy config
> to `dist/server/wrangler.json` (computing `main`, `assets`, and copying your bindings,
> `vars`, and `database_id`). You deploy *that* file. The practical consequence:
> **any change to `wrangler.toml` — especially `database_id` — only takes effect after you
> rebuild.** Always `pnpm build` immediately before `wrangler deploy`. See
> [How deploy resolves config](#how-deploy-resolves-config).

## 1. Create resources

```bash
wrangler d1 create vulse-db-prod
wrangler r2 bucket create vulse-media-prod
# Optional — if using forms:
wrangler queues create vulse-form-queue
```

## 2. `wrangler.toml`

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
```

The `nodejs_compat` flag is required for media uploads.

**Do not set `main` or `assets` yourself.** The `@astrojs/cloudflare` adapter computes both
during `astro build` and writes them into the generated `dist/server/wrangler.json`. (Older
guides reference a single `dist/_worker.js` artifact — that layout no longer applies to this
adapter; the entry is `dist/server/entry.mjs` and assets live in `dist/client/`.) Everything
else above — bindings, `vars`, `database_id`, queues, crons — *is* read from `wrangler.toml`
and copied into the generated config at build time.

## 3. Migrations

Apply Vulse's bundled migrations to your production D1:

```bash
npx vulse migrate --remote
```

This is idempotent — already-applied migrations are skipped. The runtime would apply pending migrations on the first request anyway, but doing it ahead of time means the first user doesn't pay for it.

## 4. Secrets

Set these as wrangler secrets (not `[vars]`):

```bash
wrangler secret put BETTER_AUTH_SECRET            # required, 32+ random chars
wrangler secret put VULSE_PREVIEW_SECRET          # optional; falls back to BETTER_AUTH_SECRET
# Cloudflare Images (optional):
wrangler secret put CF_IMAGES_ACCOUNT_HASH
wrangler secret put CF_IMAGES_TOKEN
```

Generate a strong `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

## 5. Seed production admin

The same flows work as in [`installation.md#4-seed-your-first-admin`](installation.md#4-seed-your-first-admin):

- **Option B — CLI:**
  ```bash
  npx vulse seed:admin --email you@company.com --remote
  ```
- **Option A — Sign-up then promote:**
  Temporarily enable sign-up in production (`PUT /api/vulse/settings/allowMemberSignUp`), create the account, run `UPDATE user SET role='admin'`, and disable sign-up again.

After bootstrap, log in to `/admin/login` and promote any additional admins via **Admin → Users**.

## 6. Build and deploy

```bash
pnpm build
wrangler deploy -c dist/server/wrangler.json
```

The build must run **immediately before** the deploy: `wrangler.toml` (including
`database_id`) is baked into `dist/server/wrangler.json` at build time, so deploying a stale
build ships stale bindings. See [How deploy resolves config](#how-deploy-resolves-config).

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

`dist/server/wrangler.json` is a **point-in-time snapshot** of `wrangler.toml` taken at build
time, with `main`, `assets`, and the resolved bindings filled in. `wrangler deploy` reads this
file, not your `wrangler.toml`. That is why:

- **Editing `wrangler.toml` has no effect on a deploy until you rebuild.** A wrong/placeholder
  `database_id` in a stale build will deploy a Worker bound to the wrong D1, even though
  `wrangler.toml` looks correct.
- **`npx vulse migrate --remote` reads `wrangler.toml` live**, while `wrangler deploy` reads the
  build snapshot. If the two disagree, migrations can hit the correct database while the
  deployed Worker points at a different one. Keep them in sync by rebuilding before every deploy.

If you're using Cloudflare Pages, point Pages at your repo and let it run `pnpm build` — the CI
environment needs the same bindings configured in the Pages dashboard. Because CI builds and
deploys in the same job, the generated config and redirect are always fresh.

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

> **`wrangler`'s `[env.*]` sections do not work with this adapter.** The
> `@astrojs/cloudflare` adapter flattens `wrangler.toml` to its **top-level** environment
> when it generates `dist/server/wrangler.json` — `[env.staging]`/`[env.production]` blocks
> are *not* copied in. (`definedEnvironments` is recorded, but the per-env bindings are
> dropped.) Running `wrangler deploy -c dist/server/wrangler.json --env staging` therefore
> fails with *"No environment found in configuration with name staging."*

Because the deployed config is whatever was at the **top level** of `wrangler.toml` at build
time, run one build+deploy per environment with that environment's values in place. Keep a
config file per environment and swap it in before building:

```bash
# Staging
cp wrangler.staging.toml wrangler.toml
pnpm build
wrangler deploy -c dist/server/wrangler.json
npx vulse migrate --remote

# Production
cp wrangler.production.toml wrangler.toml
pnpm build
wrangler deploy -c dist/server/wrangler.json
npx vulse migrate --remote
```

Each `wrangler.<env>.toml` is a complete top-level config (its own `name`, `database_id`, R2
bucket, etc.) — not an `[env.*]` section. In CI, give each environment its own job/branch so
the right config is built and deployed in isolation. `npx vulse migrate --remote` reads the
current top-level `wrangler.toml`, so run it against the same config you just built.
