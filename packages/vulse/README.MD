# Vulse

Vulse is an Astro-native, Cloudflare-hosted headless CMS. One deploy serves your public site, the admin UI (`/admin`), and the REST API (`/api/vulse/*`). Content lives in D1, assets in R2, and delivery uses Astro’s Content Layer loader (build/sync) plus a runtime SDK (SSR/members-only content).

---

## Prerequisites

- **Node.js 22+**
- **pnpm 9+**
- **A Cloudflare account** (free tier is fine)
- **Wrangler CLI** installed and logged in:

  ```bash
  npm i -g wrangler
  wrangler login
  ```

- **An Astro 6 project** with the Cloudflare adapter (`output: 'server'`). The playground in this repo is a working reference.

---

## Installation

### 1. Add Vulse to your Astro project

```bash
pnpm astro add vulse
pnpm astro add cloudflare
```

The install hook will:

- Patch `wrangler.toml` with D1 (`DB`) and R2 (`BUCKET`) bindings
- Scaffold `src/vulse/collections/page.ts` (starter blueprint)
- Create `src/content.config.ts` wired to `vulseLoader()`
- Add `.vulse/types.d.ts` to your `tsconfig.json` include list

Your `astro.config.mjs` should look like:

```js
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import vulse from 'vulse/integration'

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [vulse()],
})
```

### 2. Create Cloudflare resources

```bash
wrangler d1 create vulse-db
wrangler r2 bucket create vulse-media
```

Copy the `database_id` from the D1 output into `wrangler.toml` (replace `TODO_PASTE_ID` if the install hook left a placeholder).

Example `wrangler.toml` bindings:

```toml
[[d1_databases]]
binding = "DB"
database_name = "vulse-db"
database_id = "<your-database-id>"
migrations_dir = "node_modules/vulse/migrations"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "vulse-media"

[vars]
BETTER_AUTH_SECRET = "dev-secret-change-me-in-production-32chars"
```

### 3. Migrations

Apply bundled SQL migrations to local D1 (miniflare):

```bash
npx vulse migrate
```

For production:

```bash
npx vulse migrate --remote
```

Migrations shipped with Vulse:

| File | Purpose |
|------|---------|
| `0000_init.sql` | Core tables, Better Auth tables |
| `0001_collections_sets.sql` | Runtime schema editor (`vulse_collections`, sets) |
| `0002_tree_drafts.sql` | Tree structure, draft columns |
| `0003_fts.sql` | FTS5 search index + triggers |
| `0004_forms.sql` | Forms, submissions, upload drafts |
| `0005_globals.sql` | Global sets and values |

### 4. Seeding — first admin (super user)

Public sign-up is **off by default**. Create your first admin with one of these approaches.

#### Option A — Sign up, then promote (recommended for local dev)

1. Enable sign-up in the database **before** starting the dev server (or restart after):

   ```bash
   wrangler d1 execute DB --local --command \
     "INSERT INTO vulse_settings (key, value, updated_at) VALUES ('allowMemberSignUp', true, $(date +%s)000) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
   ```

2. Start dev and create an account at `/sign-in` (or your own sign-up page using `SignUpForm.astro`).

3. Promote the user to admin:

   ```bash
   wrangler d1 execute DB --local --command \
     "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
   ```

4. Sign in at `/admin/login`. Turn off public sign-up under **Settings → Auth** when done.

#### Option B — API bootstrap (scriptable)

With sign-up enabled (step 1 above) and the dev server running:

```bash
curl -X POST http://localhost:4321/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"your-secure-password","name":"Admin"}'

wrangler d1 execute DB --local --command \
  "UPDATE user SET role = 'admin' WHERE email = 'admin@example.com';"
```

#### Option C — `vulse seed:admin` (CLI)

From your Astro project root (where `wrangler.toml` lives):

```bash
npx vulse migrate
npx vulse seed:admin --email you@example.com
npx vulse seed:admin --email you@example.com --remote   # production D1
npx vulse seed:admin --email you@example.com --password 'your-secure-password'  # optional
```

Run `vulse migrate` first. The command creates the user via Better Auth (proper password hash), promotes them to `admin`, and prints the temporary password when one was generated.

**Roles:** `admin` (full access), `editor` (content), `member` (end-user). Promote users in **Admin → Users**.

### 5. Clearing the database

To reset local D1 content and auth (keeps schema):

```bash
wrangler d1 execute DB --local --command "
  DELETE FROM vulse_entries;
  DELETE FROM vulse_entry_revisions;
  DELETE FROM vulse_entries_fts;
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

Then re-run migrations if needed (`npx vulse migrate`) and seed a new admin.

To wipe the local D1 file entirely, delete `.wrangler/state/v3/d1/` and migrate again.

---

## Usage

### Define collections (blueprints)

Create one file per collection in `src/vulse/collections/`:

```ts
// src/vulse/collections/post.ts
import { defineCollection, z, blocks, media } from 'vulse'

export default defineCollection({
  name: 'post',
  label: 'Blog post',
  schema: z.object({
    title: z.string().min(1),
    slug: z.string(),
    excerpt: z.string().optional(),
    cover: media().optional(),
    body: blocks(),
  }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})
```

Reload `/admin` — the collection appears in the sidebar. Use **Schema** in settings to edit blueprints at runtime.

### Scaffold collection pages (Statamic-style)

After creating a collection in **Admin → Schema**, open the collection editor and use **Scaffold frontend** to copy Astro page templates and a CLI command. Or run the CLI directly:

```bash
npx vulse collection:scaffold blog \
  --route '/blog/{slug}' \
  --index '/blog'
```

This generates:

| Output | Purpose |
|--------|---------|
| `src/vulse/collections/<handle>.ts` | Code blueprint with `preview.path`, access rules |
| `src/pages/<segment>/[slug].astro` | Entry detail page (runtime SDK) |
| `src/pages/<segment>/index.astro` | Listing page (`getCollection`) — when `--index` is set |
| `src/content.config.ts` | Adds a `vulseLoader()` entry (merged if file exists) |

Options:

```bash
npx vulse collection:scaffold page --route '/{slug}'          # show-only at site root
npx vulse collection:scaffold blog --force                    # overwrite existing files
npx vulse collection:scaffold blog --skip-blueprint           # pages + content.config only
```

Restart the dev server after scaffolding, then create entries under **Admin → Collections**.

### Admin UI

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard |
| `/admin/login` | Staff sign-in |
| `/admin/collections/:name` | Entry list / tree |
| `/admin/collections/:name/new` | Create entry |
| `/admin/collections/:name/:id` | Edit entry (+ Preview) |
| `/admin/media` | Asset library |
| `/admin/users` | User management |
| `/admin/settings/auth` | Sign-up toggle, domain allowlist |
| `/admin/settings/sets` | Reusable block sets |
| `/admin/settings/globals` | Site-wide global content sets |
| `/admin/forms` | Form builder and submissions |
| `/admin/schema/:handle` | Blueprint editor (+ scaffold frontend panel) |

### Content delivery — static / SSG path

Wire the Content Layer in `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content'
import { vulseLoader } from 'vulse/loader'

export const collections = {
  post: defineCollection({
    loader: vulseLoader({ collection: 'post' }),
    schema: z.object({
      title: z.string(),
      slug: z.string(),
      body: z.any().optional(),
    }),
  }),
}
```

Use standard Astro content APIs in pages:

```astro
---
import { getCollection } from 'astro:content'
import BlockRenderer from 'vulse/client/BlockRenderer.astro'

const posts = await getCollection('post')
const post = posts.find((p) => p.data.slug === Astro.params.slug)
---
<h1>{post.data.title}</h1>
<BlockRenderer blocks={post.data.body ?? []} />
```

The loader reads **published** entries from D1 at sync/build time. In dev, D1 is resolved via wrangler’s platform proxy (no extra config).

For **filtering, pagination, or author archives**, use the runtime SDK (`rt.sdk.collections.find`) instead of `getCollection` — the loader intentionally syncs the full published set for static generation.

### Content delivery — SSR / dynamic path

Use the runtime SDK in server-rendered pages:

```ts
import { getRuntimeEnv, getRuntime, createDb, registryForRequest } from 'vulse/server'

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

const post = await rt.sdk.collections.findBySlug('post', slug, {
  audience: session?.user ?? null,
})

// Filtered / paginated listing (SSR archives, author pages)
const archive = await rt.sdk.collections.find('post', {
  audience: session?.user ?? null,
  orderBy: 'publishedAt',
  order: 'desc',
  limit: 20,
  offset: 0,
  createdBy: userId,              // optional — filter by author
  publishedAfter: '2026-01-01',   // optional — ISO date string
})

const results = await rt.sdk.search.query('astro', { collections: ['post'], limit: 10 })
const imageUrl = rt.sdk.media.url(mediaId, 'hero')
```

### Live Preview

The entry editor includes a **split-panel live preview** beside the form. As you edit fields, the iframe updates the real public page template without autosaving to the database — unsaved state lives in a short-lived preview session (1 hour TTL).

| Mechanism | Trigger | Content source | Writes DB? |
|-----------|---------|----------------|------------|
| **Live preview panel** | Typing in the editor | Preview session (`vulse_live_preview` token) | Never |
| **Preview button** | Click **Preview** in toolbar | Saved draft via signed `vulse_preview` cookie | Only if you saved |

Both can be active. Use `resolvePreviewContent()` in SSR page templates — it applies priority: **live session → saved draft → published**.

```astro
---
import { getRuntimeEnv, getRuntime, createDb, registryForRequest, resolvePreviewContent } from 'vulse/server'

const entry = await rt.sdk.collections.findBySlug('post', slug, { audience: session?.user ?? null })
if (!entry) return new Response(null, { status: 404 })

const content = resolvePreviewContent(entry, Astro.locals)
---
```

**SSR required:** Live preview only works on server-rendered pages (`output: 'server'` in `astro.config.mjs`). Loader-only SSG pages cannot reflect unsaved session state at request time. The Preview button (saved draft cookie) may still work if the page has an SSR fallback.

**Blueprint options:**

```ts
preview: {
  path: '/blog/{slug}',
  rootSelector: 'article', // DOM morph target; defaults to 'main'
  live: false,             // hide split panel; Preview button still works
}
```

Set `preview.rootSelector` when your layout does not use a `<main>` element. Set `preview.live: false` to disable the inline panel for collections that should only use the saved-draft Preview flow.

---

## Configuration

### `wrangler.toml` bindings

| Binding | Required | Purpose |
|---------|----------|---------|
| `DB` | Yes | D1 database |
| `BUCKET` | Yes | R2 bucket for media uploads |

### Environment variables (`[vars]` / secrets)

| Variable | Required | Purpose |
|----------|----------|---------|
| `BETTER_AUTH_SECRET` | Yes | Session signing (32+ chars in production) |
| `BETTER_AUTH_URL` | No | Auth base URL override |
| `VULSE_PREVIEW_SECRET` | No | Preview cookie signing (falls back to `BETTER_AUTH_SECRET`) |
| `CF_IMAGES_ACCOUNT_HASH` | No | Cloudflare Images delivery URLs |
| `CF_IMAGES_TOKEN` | No | CF Images API (variant registration) |

Without `CF_IMAGES_*`, media previews fall back to R2-proxied URLs (`/api/vulse/media/:id/file`).

### Settings stored in D1

| Key | Default | Purpose |
|-----|---------|---------|
| `allowMemberSignUp` | `false` | Public member registration |
| `allowedSignUpDomains` | `[]` | Email domain allowlist (empty = any) |

Managed in **Admin → Settings → Auth**. Changing auth settings invalidates the runtime cache on the next request.

### Integration options

```ts
vulse({ adminPath: '/admin' }) // override admin URL prefix
```

---

## Frontend foundation

Vulse ships **headless** auth and rendering primitives — you own all styling.

### Block rendering

ProseMirror JSON from the TipTap editor renders via:

```astro
import BlockRenderer from 'vulse/client/BlockRenderer.astro'
<!-- or Vue: import BlockRenderer from 'vulse/client/BlockRenderer.vue' -->

<BlockRenderer blocks={entry.body} mediaUrl={(id, variant) => `/api/vulse/media/${id}/file`} />
```

Legacy flat block arrays are also supported.

#### Styling built-in blocks

Built-in block nodes render with stable `data-vulse-*` hooks you can target in CSS:

```css
[data-vulse-accordion] { border: 1px solid #e4e4e7; border-radius: 0.5rem; }
[data-vulse-accordion] summary { font-weight: 600; padding: 0.75rem 1rem; cursor: pointer; }
[data-vulse-callout][data-tone="warning"] { background: #fef3c7; padding: 1rem; }
.vulse-heading { margin-top: 2rem; }
```

The admin preview and public Vue renderer share the same class names and data attributes.

#### Custom block sets (Vue)

Reusable sets defined under **Admin → Settings → Sets** appear in the editor as `vulseSet` nodes. On the public site, register a Vue component per set handle:

```vue
<script setup lang="ts">
import BlockRenderer from 'vulse/client/BlockRenderer.vue'
import QuoteSet from '../components/sets/QuoteSet.vue'

defineProps<{ body: unknown }>()
</script>

<template>
  <BlockRenderer
    :blocks="body"
    :components="{ 'set:quote': QuoteSet }"
    :media-url="(id) => `/api/vulse/media/${id}/file`"
  />
</template>
```

Each set component receives a `data` prop with the set’s field values (matching the set schema).

> **Note:** `BlockRenderer.astro` renders built-in blocks server-side. Custom sets output a placeholder unless you use the Vue renderer or map sets to your own Astro components manually.

### Replicator fields

A **replicator** is a collection-level field (not part of the rich-text body). It stores an ordered list of typed blocks defined in the blueprint:

```json
[
  { "set": "hero", "content": { "title": "Welcome", "image": "media-id" } },
  { "set": "cta", "content": { "label": "Get started", "url": "/signup" } }
]
```

Define it in a blueprint via the schema editor (**kind: replicator**) or in code when using programmatic definitions. On the frontend, loop and dispatch to your own components — `BlockRenderer` is not used:

```astro
---
import Hero from '../components/sections/Hero.astro'
import Cta from '../components/sections/Cta.astro'

const sections = entry.data.sections ?? []
---
{sections.map((item) => {
  if (item.set === 'hero') return <Hero {...item.content} />
  if (item.set === 'cta') return <Cta {...item.content} />
})}
```

Use a `switch` or a component map keyed by `item.set` for larger sites.

### End-user auth pages (opt-in)

Sign-up is **disabled by default**. To offer public registration:

1. Enable **Admin → Settings → Auth → Allow member sign-up** (or set `allowMemberSignUp` in D1).
2. Add a sign-in page using the headless forms (see playground `src/pages/sign-in.astro`):

```astro
---
import SignInForm from 'vulse/client/components/SignInForm.astro'
import SignUpForm from 'vulse/client/components/SignUpForm.astro'
const next = Astro.url.searchParams.get('next') ?? '/'
---
<h1>Sign in</h1>
<SignInForm redirectTo={next}>
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button type="submit">Sign in</button>
</SignInForm>

<h2>Create account</h2>
<SignUpForm redirectTo={next}>
  <input name="name" type="text" />
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button type="submit">Sign up</button>
</SignUpForm>
```

Hide the sign-up block when registration is off, or rely on the API returning 403. Forms emit `vulse:sign-in:success`, `vulse:sign-up:error`, etc. for custom toast handling.

### End-user auth (browser SDK)

```ts
import { auth as vulseAuth } from 'vulse/client/auth'

await vulseAuth.signIn({ email, password })
await vulseAuth.signUp({ email, password, name })
await vulseAuth.signOut()
const session = await vulseAuth.session()
```

### Headless Astro components

| Component | Import | Purpose |
|-----------|--------|---------|
| `SignInForm.astro` | `vulse/client/components/SignInForm.astro` | Slot-based sign-in form |
| `SignUpForm.astro` | `vulse/client/components/SignUpForm.astro` | Slot-based sign-up form |
| `SignOutButton.astro` | `vulse/client/components/SignOutButton.astro` | Sign-out button |
| `SessionGuard.astro` | `vulse/client/components/SessionGuard.astro` | Server-side role gate |

Example:

```astro
---
import SignInForm from 'vulse/client/components/SignInForm.astro'
---
<SignInForm redirectTo="/account" class="my-form">
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button type="submit">Sign in</button>
</SignInForm>
```

Forms dispatch custom events (`vulse:sign-in:success`, `vulse:sign-in:error`, etc.) for your own UI feedback.

### Member-gated pages

```astro
---
import SessionGuard from 'vulse/client/components/SessionGuard.astro'
---
<SessionGuard requireRole="member" redirectTo="/sign-in">
  <h1>Members only</h1>
</SessionGuard>
```

### Generated types

On dev/build, Vulse writes `.vulse/types.d.ts` from your blueprint files. Ensure it is included in `tsconfig.json`:

```json
{
  "include": [".astro/types.d.ts", ".vulse/types.d.ts", "**/*"]
}
```

---

## Development

### User project (playground-style)

```bash
pnpm install
npx vulse migrate
pnpm dev
```

Open the URL printed in the terminal (often `http://localhost:4321`). Admin: `/admin/login`.

### This monorepo (`vulseastro`)

```bash
pnpm install
pnpm --filter vulse build          # compile package after TS changes
cd playground/vulse-play && pnpm dev
```

Package scripts:

```bash
pnpm --filter vulse test             # unit tests
pnpm --filter vulse test:integration # D1/miniflare integration tests
pnpm --filter vulse typecheck
```

### Package exports

| Import | Purpose |
|--------|---------|
| `vulse` | Blueprint helpers (`defineCollection`, `z`, `blocks`, `media`, `ref`) |
| `vulse/integration` | Astro integration |
| `vulse/loader` | Content Layer `vulseLoader()` |
| `vulse/server` | Runtime SDK (`getRuntime`, `createSdk`, …) |
| `vulse/client` | Block types, schemas |
| `vulse/client/auth` | Browser auth SDK |
| `vulse/integration/cron` | Scheduled media purge handler |

---

## Deployment

Vulse targets **Cloudflare Workers/Pages** with a single artifact.

1. **Production D1 & R2** — create resources in your Cloudflare account; update `wrangler.toml` with production IDs.

2. **Migrate remote database:**

   ```bash
   npx vulse migrate --remote
   ```

3. **Secrets** (do not commit these):

   ```bash
   wrangler secret put BETTER_AUTH_SECRET
   wrangler secret put VULSE_PREVIEW_SECRET
   # Optional — Cloudflare Images:
   wrangler secret put CF_IMAGES_ACCOUNT_HASH
   wrangler secret put CF_IMAGES_TOKEN
   ```

4. **Seed production admin** — use the same bootstrap flow as local (enable sign-up → create user → promote → disable sign-up), or your preferred automation.

5. **Build & deploy:**

   ```bash
   pnpm build
   wrangler deploy   # or Cloudflare Pages via your CI
   ```

6. **Cron (optional)** — soft-deleted media is hard-purged after 7 days. Wire in your worker:

   ```ts
   import { vulseScheduled } from 'vulse/integration/cron'

   export default {
     async scheduled(event, env, ctx) {
       ctx.waitUntil(vulseScheduled(env))
     },
   }
   ```

   Add a `[triggers]` cron schedule in `wrangler.toml`.

---

## Forms

Vulse includes a first-party form builder: define forms in **Admin → Forms**, embed them on the public site with `FormRenderer`, and store submissions in D1.

### Embed a form

```astro
---
import FormRenderer from 'vulse/client/components/FormRenderer.astro'
---
<FormRenderer form="contact">
  <input name="name" type="text" required />
  <input name="email" type="email" required />
  <textarea name="message" required />
  <button type="submit">Send</button>
</FormRenderer>
```

The component posts JSON to `POST /api/vulse/forms/:handle/submit`. Listen for `vulse:form:success` and `vulse:form:error` on the form element.

### Admin

- **Forms** — create/edit field definitions, success message, redirect, notification emails
- **Submissions** — list, detail view, bulk delete, CSV export

### Spam & limits (v1)

- Honeypot field (default `_hp`) — non-empty values get a fake success response without storage
- Per-IP rate limiting (default 10 submissions / hour per form)
- Per-form unique fields (e.g. one newsletter signup per email)

### File uploads

Two-phase: `POST /api/vulse/forms/:handle/upload` (multipart `file` + `field`) returns `{ mediaId }`; include the media ID in the submit payload. Orphan draft uploads are purged by the scheduled cron handler.

### Async processing (`FORM_QUEUE`)

Submit responses return immediately. Notification/confirmation emails and webhooks run in a queue consumer:

```toml
[[queues.producers]]
queue = "vulse-form-queue"
binding = "FORM_QUEUE"

[[queues.consumers]]
queue = "vulse-form-queue"
max_batch_size = 10
max_batch_timeout = 30
```

Export `vulseFormQueue` from your worker entry and wire it to the consumer. Without a queue binding, submissions are stored but side effects must be processed manually (or via cron in dev).

### Integration hooks

```ts
vulse({
  forms: {
    onSubmit: async ({ form, payload, submission }) => { /* CRM, Slack, etc. */ },
    onAfterProcess: async ({ form, submission }) => { /* after built-in actions */ },
  },
})
```

Hooks run in the queue consumer, not the submit handler.

---

## Globals

Globals are **site-wide content sets** (Statamic-style) that are not tied to a URL or collection entry. Use them for footer copy, contact details, social links, default SEO text, or anything your layout needs on every page.

They are separate from **Site settings** (`vulse_settings`) — those are flat key/value config (auth flags, deploy hooks). Globals use structured fields, an editor UI, and a public read API.

> **Security:** All global values are public. Do not store secrets, API keys, or raw analytics scripts in globals.

### Admin

Under **Settings → Globals** (`/admin/settings/globals`):

1. Create a global set (handle + label). You can save a set with **no fields** first, then add fields later.
2. Define fields on the left (text, textarea, blocks, date, boolean, select, asset).
3. Edit content values on the right and click **Save content**.

| Action | Role |
|--------|------|
| Read (list / get set + value) | `admin`, `editor` |
| Create / update definition / update value / delete | `admin` only |

### Public API (fetch-only)

No authentication. Responses use the standard Vulse envelope (`{ ok: true, data: … }`).

```txt
GET /api/vulse/public/globals
GET /api/vulse/public/globals/:handle
```

**All sets** — keyed by handle:

```json
{
  "ok": true,
  "data": {
    "site": {
      "siteName": "Vulse",
      "tagline": "Content everywhere"
    },
    "footer": {
      "copyright": "© 2026 Vulse"
    }
  }
}
```

**Single set** — content object only:

```json
{
  "ok": true,
  "data": {
    "siteName": "Vulse",
    "tagline": "Content everywhere"
  }
}
```

### Admin API

Requires a staff session (cookie from `/admin/login`).

```txt
GET    /api/vulse/globals
GET    /api/vulse/globals/:handle          → { set, value }
POST   /api/vulse/globals                  → create set (definition)
PUT    /api/vulse/globals/:handle          → update definition
PUT    /api/vulse/globals/:handle/value    → update content only
DELETE /api/vulse/globals/:handle
```

`POST` and `PUT` (definition) accept a global set definition:

```json
{
  "handle": "site",
  "label": "Site",
  "fields": [
    { "name": "siteName", "label": "Site name", "ui": { "kind": "text" }, "optional": false },
    { "name": "tagline", "ui": { "kind": "textarea" }, "optional": true }
  ]
}
```

`PUT /api/vulse/globals/:handle/value` accepts only the content object:

```json
{
  "siteName": "Vulse",
  "tagline": "Content everywhere"
}
```

Invalid content returns HTTP 422 with validation issues in the error envelope.

### Frontend usage

Fetch at build time (SSG) or request time (SSR). There is no Astro Content Layer loader for globals in v1 — use `fetch` against the public API.

**All globals in a layout (Astro):**

```astro
---
const res = await fetch(new URL('/api/vulse/public/globals', Astro.url))
const { data: globals } = await res.json() as {
  ok: true
  data: Record<string, Record<string, unknown>>
}
---
<footer>
  <p>{globals.footer?.copyright}</p>
  <p>{globals.site?.tagline}</p>
</footer>
```

**Single set:**

```astro
---
const res = await fetch(new URL('/api/vulse/public/globals/site', Astro.url))
const { data: site } = await res.json() as { ok: true; data: { siteName?: string; tagline?: string } }
---
<title>{site.siteName ?? 'My site'}</title>
```

**Client-side (after hydration):**

```ts
const res = await fetch('/api/vulse/public/globals')
const { data: globals } = await res.json()
console.log(globals.site?.siteName)
```

For static builds, prefer fetching in `getStaticPaths` / layout frontmatter so values are baked into HTML. On SSR, the same URLs resolve on your Worker origin.

### TypeScript shape

```ts
type PublicGlobals = Record<string, Record<string, unknown>>
// globals.site.siteName, globals.footer.copyright, etc.
```

---

## Testing

### Unit tests

```bash
cd packages/vulse
pnpm test
```

### Integration tests (D1 + Workers runtime)

```bash
pnpm test:integration
```

Uses `@cloudflare/vitest-pool-workers` with an in-memory D1 binding.

### Playground smoke test

```bash
cd playground/vulse-play
pnpm build
pnpm preview
```

---

## Troubleshooting

### Admin routes return 404

- Restart the dev server after upgrading Vulse or changing the integration.
- Kill stale Astro processes (`pkill -f "astro dev"`) — old instances may not have injected routes.
- Check the terminal for the actual port (if 4321 is busy, Astro picks another).

### Vite / SSR cache errors after config changes

```bash
rm -rf node_modules/.vite
pnpm dev
```

### `Vulse: D1 binding "DB" is missing`

Ensure `wrangler.toml` has the `[[d1_databases]]` block with `binding = "DB"` and `platformProxy: { enabled: true }` in the Cloudflare adapter config.

### `Vulse: R2 binding "BUCKET" is missing`

Add the `[[r2_buckets]]` block. Media uploads require R2 even when Cloudflare Images is not configured.

### `BETTER_AUTH_SECRET missing`

Add to `[vars]` in dev; use `wrangler secret put` in production. Use a long random string (32+ characters).

### Sign-in returns 403 / CSRF issues

Better Auth expects a matching `Origin` header. The admin login form sends this automatically; custom fetch clients should set `Origin` to your site URL.

### Content Layer / `getCollection` empty

- Confirm entries are **published** (drafts are excluded by default).
- Run `npx vulse migrate` if the DB is fresh.
- Restart dev after adding `src/content.config.ts` (Astro 6 uses this path, not `src/content/config.ts`).

### Public sign-up rejected

Sign-up is disabled by default. Enable it in **Admin → Settings → Auth**, or insert `allowMemberSignUp: true` into `vulse_settings` and restart dev.

### Media uploads fail

Verify R2 binding, run migrations, and check that the playground/worker has `nodejs_compat` in `compatibility_flags`.

### Type errors for collections

Ensure `.vulse/types.d.ts` is in `tsconfig.json` `include`. Regenerate by restarting dev (the integration writes types on `astro:config:setup`).

---

## License

See the repository root for license information.
