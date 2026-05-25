# Deployment

Vulse targets **Cloudflare Workers / Pages** with a single artifact: one deploy serves your public site, the admin UI, and the API.

## Production checklist

1. [Create Cloudflare resources](#1-create-resources) — production D1, R2, optional Queue.
2. [Update `wrangler.toml`](#2-wranglertoml) with production IDs.
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

## 2. `wrangler.toml`

```toml
name = "my-site"
main = "./dist/_worker.js"
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
wrangler deploy
```

If you're using Cloudflare Pages, point Pages at your repo and let it run `pnpm build` — the CI environment needs the same bindings configured in the Pages dashboard.

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

After `wrangler deploy`:

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

Use wrangler environments to deploy preview and production from one repo:

```toml
[env.staging]
name = "my-site-staging"
[[env.staging.d1_databases]]
binding = "DB"
database_name = "vulse-db-staging"
database_id = "<staging-id>"

[env.production]
name = "my-site"
[[env.production.d1_databases]]
binding = "DB"
database_name = "vulse-db-prod"
database_id = "<prod-id>"
```

```bash
wrangler deploy --env staging
wrangler deploy --env production
npx vulse migrate --remote --env staging
```
