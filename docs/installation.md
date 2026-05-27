# Installation

This guide walks through installing Vulse into a fresh or existing Astro project, provisioning the required Cloudflare resources, and creating your first admin user.

## Prerequisites

- **Node.js 22+** — Vulse and Astro 6 both require it.
- **pnpm 9+** — the monorepo and the integration's install hook assume pnpm.
- **A Cloudflare account** — the free tier is enough to get started.
- **Wrangler CLI**, logged in:

  ```bash
  npm i -g wrangler
  wrangler login
  ```

- **An Astro 6 project with the Cloudflare adapter** in server-output mode (`output: 'server'`). If you don't have one, generate it with:

  ```bash
  pnpm create astro@latest -- --template minimal my-site
  cd my-site
  pnpm astro add cloudflare
  ```

  Or take a look at [`playground/vulse-play/`](../playground/vulse-play) — it is a working reference.

## 1. Add Vulse to your Astro project

```bash
pnpm astro add @vulsecms/core
pnpm add @astrojs/vue vue
```

Vulse wires up `@astrojs/vue` internally for the admin UI, but **your project must also depend on `@astrojs/vue` and `vue` directly** so the Cloudflare dev runner can resolve `@astrojs/vue/server.js`.

The install hook will:

- patch `wrangler.toml` with D1 (`DB`) and R2 (`BUCKET`) bindings,
- scaffold `src/vulse/collections/page.ts` (a starter blueprint),
- create `src/content.config.ts` wired to `vulseLoader()`,
- add `.vulse/types.d.ts` to your `tsconfig.json` `include` list.

Your `astro.config.mjs` should look like this:

```js
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import vulse from '@vulsecms/core/integration'

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [vulse()],
})
```

The `platformProxy: { enabled: true }` flag is required so the dev server can resolve D1 and R2 bindings against your local wrangler state.

## 2. Run the setup wizard (recommended)

If you'd rather not edit `wrangler.toml` and `.dev.vars` by hand, the setup wizard does sections 2–4 of this guide in one go:

```bash
npx vulse setup
```

It will create the D1 database and splice the `database_id` into `wrangler.toml`, create the R2 bucket, generate `BETTER_AUTH_SECRET` and `VULSE_PREVIEW_SECRET` into `.dev.vars` (and add it to `.gitignore`), apply migrations, and seed your first admin user.

Skip ahead to [section 5](#5-verify-the-install) once it finishes. For non-interactive use (`--yes`, `--email`, `--password`), see [`cli.md`](cli.md#vulse-setup).

> **Development only** — `npx vulse setup` creates a local development database and writes `wrangler.toml` as your dev config. Your production site will use a separate D1 database. The same migrations apply to both — run `npx vulse migrate --remote` against your production database to bring its schema up to date without recreating anything. You never need to edit `wrangler.toml` back and forth: keep a separate `wrangler.production.toml` for production. See [deployment.md](deployment.md).

The sections below describe the same steps performed manually — useful if you prefer full control or need to recover a partial setup.

## 2b. Create the Cloudflare resources (manual)

```bash
wrangler d1 create vulse-db
wrangler r2 bucket create vulse-media
```

Copy the `database_id` printed by the D1 command into `wrangler.toml`. A minimal block looks like:

```toml
[[d1_databases]]
binding = "DB"
database_name = "vulse-db"
database_id = "<your-database-id>"
migrations_dir = "node_modules/@vulsecms/core/migrations"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "vulse-media"

[vars]
BETTER_AUTH_SECRET = "dev-secret-change-me-in-production-32chars"
```

In production, swap `BETTER_AUTH_SECRET` to a wrangler secret — see [`deployment.md`](deployment.md).

## 3. Run migrations (manual)

Apply the bundled SQL migrations to local D1 (miniflare):

```bash
npx vulse migrate
```

The full list of migrations and their purposes is in [`directory-structure.md`](directory-structure.md#migrations).

## 4. Seed your first admin (manual)

Vulse is shipped **with public sign-up disabled**. Pick one of the three flows below to create your first admin.

### Option A — Sign up, then promote (recommended for local dev)

1. Enable sign-up in the database **before** starting the dev server:

   ```bash
   wrangler d1 execute DB --local --command \
     "INSERT INTO vulse_settings (key, value, updated_at) VALUES ('allowMemberSignUp', true, $(date +%s)000) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
   ```

2. Start `pnpm dev` and create an account at `/sign-in` (or your own sign-up page using `SignUpForm.astro` — see [`frontend.md`](frontend.md#end-user-auth)).

3. Promote the new user to admin:

   ```bash
   wrangler d1 execute DB --local --command \
     "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
   ```

4. Sign in at `/admin/login`. When you're done, turn public sign-up off in **Settings → Auth**.

### Option B — `vulse seed:admin` (CLI)

From the Astro project root (where `wrangler.toml` lives):

```bash
npx vulse migrate
npx vulse seed:admin --email you@example.com
# or in production:
npx vulse seed:admin --email you@example.com --remote
# with an explicit password (otherwise a random one is generated and printed):
npx vulse seed:admin --email you@example.com --password 'your-secure-password'
```

The command creates the user via Better Auth (proper password hashing), promotes them to `admin`, and prints the temporary password when one was generated.

### Option C — API bootstrap (scriptable)

With sign-up enabled (step 1 of Option A) and the dev server running:

```bash
curl -X POST http://localhost:4321/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"your-secure-password","name":"Admin"}'

wrangler d1 execute DB --local --command \
  "UPDATE user SET role = 'admin' WHERE email = 'admin@example.com';"
```

### Roles

| Role | Capability |
|------|------------|
| `admin` | Full access — manage schema, users, settings |
| `editor` | Content — create, edit, publish entries; manage media; review form submissions |
| `member` | End-user account — sign in to your public site |

You can change a user's role anytime in **Admin → Users**.

## 5. Verify the install

```bash
pnpm dev
```

Browse to:

- `/` — your site (the install hook leaves a placeholder if you didn't have content yet).
- `/admin` — the admin UI; redirects to `/admin/login` if you're not signed in.
- `/api/vulse/public/globals` — should return `{"ok":true,"data":{}}` (no globals defined yet).

If any of those fail, jump to [`troubleshooting.md`](troubleshooting.md).

## 6. Wiping local data

To reset the local D1 content but keep the schema:

```bash
wrangler d1 execute DB --local --command "
  DELETE FROM vulse_entry_locales;
  DELETE FROM vulse_entries;
  DELETE FROM vulse_entry_revisions;
  DELETE FROM vulse_media;
  DELETE FROM vulse_settings;
  DELETE FROM vulse_collections;
  DELETE FROM vulse_sets;
  DELETE FROM vulse_forms;
  DELETE FROM vulse_form_submissions;
  DELETE FROM vulse_global_sets;
  DELETE FROM vulse_global_values;
  DELETE FROM session;
  DELETE FROM account;
  DELETE FROM user;
"
```

To wipe the local D1 file entirely (and re-run migrations from scratch), delete `.wrangler/state/v3/d1/` in your project and run `npx vulse migrate` again.

## Next steps

- Define your first collection — see [`content-modeling.md`](content-modeling.md).
- Wire entries onto Astro pages — see [`frontend.md`](frontend.md).
- Explore the admin UI — see [`control-panel.md`](control-panel.md).
