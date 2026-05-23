# Vulse for Astro — v1 Design Spec

**Status:** Draft for review
**Date:** 2026-05-23
**Author:** Espen (with Claude)

## Vision

Vulse is an opinionated, Astro-native, Cloudflare-hosted headless CMS. After `astro add vulse`, an Astro project gains a full content management experience — schema-driven admin UI, block editor, revisions, user management, asset hosting — all running as part of the same single-deploy Astro application on Cloudflare.

Vulse competes with StudioCMS by being more opinionated (one storage stack, one host, one auth) and by treating Astro's Content Layer as a first-class consumer rather than an afterthought.

## Decisions locked in

| Area | Decision |
|---|---|
| Distribution | Astro integration installed via `astro add vulse`; single Cloudflare deploy |
| Database | Cloudflare D1, accessed via Drizzle ORM, in both local (miniflare via wrangler) and production |
| Schema definition | Code-first Zod blueprints in `src/vulse/collections/*.ts`; admin UI reflects them at runtime |
| Admin UI stack | Astro pages with Vue islands |
| API layer | Native Astro endpoints injected by the integration (no Hono/H3) |
| Content delivery | Astro Content Layer loader for static; typed runtime SDK for SSR/dynamic |
| Asset hosting | Cloudflare R2 for originals, Cloudflare Images for variants |
| Auth | Better Auth, covering both `/admin` and end-user/member auth |
| Local dev | Wrangler-driven from day one (miniflare D1 + R2) |
| Block editor | Port the existing Vue editor as a Vue island; reuse zero-dep renderer |
| v1 scope | Full v1 in one spec (this document) |

## 1. Architecture

### 1.1 One artifact, one deploy

Vulse runs inside the user's Astro project. The same Worker serves the public site, the admin UI, and the API. No separate services, no cross-origin requests, no parallel deploys.

The integration injects:

- **Admin pages** at `/admin/*` — Astro pages with Vue islands for interactive screens.
- **API endpoints** at `/api/vulse/*` — native Astro endpoint files that delegate to handler functions in the `server` layer.
- **Content loader** — `vulseLoader()` consumed from the user's `src/content/config.ts`.
- **Runtime SDK** — `vulse` object exposed from `vulse/server`, usable in SSR pages and API routes.
- **Bindings in `wrangler.toml`** — `DB` (D1), `BUCKET` (R2), Better Auth and preview secrets.

### 1.2 Four-layer structure

Each layer depends only on the one below it. This is the unit boundary that gates code review.

1. **`core`** — Drizzle schema, migrations, blueprint registry, validators, repositories. Pure logic. No Astro or HTTP imports.
2. **`server`** — Astro endpoint handlers, Better Auth wiring, R2/Cloudflare Images adapters, loader implementation, SDK. Depends on `core`.
3. **`admin`** — Astro pages and Vue islands. Talks to `server` over HTTP only. No direct imports from `core` or `server` internals.
4. **`integration`** — The `astro-integration` entry point. Wires routes, injects middleware, patches `wrangler.toml`, exposes public modules.

The admin → server boundary is HTTP rather than direct function calls. This costs a small amount of internal complexity in v1 but means we can later split admin into a separate Worker without rewriting the admin UI.

### 1.3 Why native Astro endpoints (not Hono)

Vulse exposes roughly 30–50 REST endpoints. Native Astro endpoints handle that scale fine and bring three concrete wins:

- One less production dependency, tighter alignment with the "Astro-native" identity.
- Better Auth has a first-class Astro adapter; auth routes are one-liners.
- Astro middleware (cookies, security headers, request context) applies without an adapter shim.

Shared concerns (auth guard, Zod validation, error envelope) are handled by an internal `handler()` wrapper (~80 lines) that endpoint files import. If we ever outgrow this we can introduce Hono behind the same handler surface; users wouldn't notice.

## 2. Data model

### 2.1 Blueprints (user-authored)

Collections are defined as Zod schemas in `src/vulse/collections/*.ts`:

```ts
// src/vulse/collections/post.ts
import { defineCollection, z, blocks } from 'vulse'

export default defineCollection({
  name: 'post',
  label: 'Blog post',
  schema: z.object({
    title: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    excerpt: z.string().optional(),
    body: blocks(),
    coverImage: z.media().optional(),
    publishedAt: z.date().optional(),
    author: z.ref('user'),
  }),
  admin: {
    titleField: 'title',
    listColumns: ['title', 'publishedAt', 'author'],
  },
  access: {
    read:   ({ user, entry }) => entry.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user, entry }) => user?.role === 'admin' || entry.created_by === user?.id,
    delete: ({ user }) => user?.role === 'admin',
  },
})
```

At build time the integration scans `src/vulse/collections/`, registers each blueprint, and emits a generated `vulse.d.ts` so `getCollection('post')` and `vulse.posts.find()` are typed against the blueprint.

Field display hints (label, help text, placeholder, widget override, `indexed: true`) attach via a `field()` wrapper or `.describe()` JSON payload. The capability is fixed; the surface API is finalized during implementation.

### 2.2 DB schema (Drizzle on D1)

A generic `entries` table — not a table per collection. CMS schemas iterate too often for per-blueprint migrations to be tolerable.

```
entries           id, collection, slug, status, locale, version,
                  content (JSON, validated against blueprint),
                  published_at, created_at, updated_at,
                  created_by, updated_by
                  PRIMARY KEY (id)
                  UNIQUE (collection, slug, locale)
                  INDEX (collection, status, published_at)

entry_revisions   id, entry_id, version, content (JSON),
                  author_id, change_summary, created_at
                  every save writes a new row

media             id, r2_key, mime, size, width, height,
                  alt, blurhash, uploaded_by, created_at, deleted_at

settings          key TEXT PRIMARY KEY, value (JSON), updated_at
```

Better Auth owns its own tables (`user`, `session`, `account`, `verification`) via its Drizzle adapter. Vulse extends `user` with `role` (`admin | editor | member`) and `display_name`.

### 2.3 Why JSON-in-`entries`

- Adding or renaming a blueprint field is a code change, not a DB migration.
- Drafts can hold partially-invalid content; we validate on publish, not on column types.
- Cross-collection queries (search, recent activity) become one query, not N.
- The cost is query ergonomics for content-field filtering. Solved with denormalized columns when blueprint fields declare `indexed: true` — they become real columns alongside the JSON. If a user needs ad-hoc filtering on a non-indexed field, they fall back to scanning. v1 ships the `indexed: true` mechanism.

### 2.4 Migrations

Only Vulse's own tables are migrated. Drizzle migration files are bundled with the package and applied by `npx vulse migrate`, idempotent, run as part of every deploy. User blueprint changes never trigger a migration.

### 2.5 Revisions write path

Every `PUT /api/vulse/entries/:id` does, in one D1 transaction:

1. Insert a new `entry_revisions` row with `version = current + 1`.
2. Update `entries.content` and `entries.version`.

Restoring a revision reads its content and writes a new revision on top — no destructive operations. v1 ships no revision pruning; retention policies are a follow-up.

### 2.6 Slugs and locale

`UNIQUE (collection, slug, locale)`. v1 wires only the default locale; the `locale` column is present so full i18n is additive in v1.x.

## 3. Public-site content flow

### 3.1 Astro Content Layer loader (default path)

```ts
// src/content/config.ts (user's project)
import { defineCollection } from 'astro:content'
import { vulseLoader } from 'vulse/loader'

export const collections = {
  post: defineCollection({ loader: vulseLoader({ collection: 'post' }) }),
  page: defineCollection({ loader: vulseLoader({ collection: 'page' }) }),
}
```

- Runs at build time (or `astro sync`).
- Queries D1 via the wrangler binding — miniflare locally, prod D1 in CI with a read-only token.
- Pulls only published entries by default. `previewToken` opt-in pulls drafts (for preview branches).
- Feeds standard `getCollection()` / `getEntry()` APIs. No new APIs to learn.
- `z.media()` fields resolve to `{ src, width, height, alt, blurhash }`. `src` is a Cloudflare Images delivery URL.
- `blocks()` fields come through as typed JSON. Users render with `<BlockRenderer blocks={...} />`.
- Incremental rebuilds use an `updated_at` watermark; only changed entries are pulled.
- A "Publish" action in admin can fire a deploy hook (URL configured in settings) to trigger a CF Pages rebuild.

### 3.2 Runtime SDK (SSR / dynamic / member-only)

```ts
// src/pages/members/[slug].astro
import { vulse } from 'vulse/server'

const post = await vulse.posts.findBySlug(Astro.params.slug, {
  audience: Astro.locals.user,
})
```

- Same Drizzle layer underneath — one query path to maintain.
- Reads from `Astro.locals.runtime.env.DB` on Cloudflare; from miniflare in `astro dev`.
- Enforces blueprint `access.read` against the calling session.

### 3.3 When to use which

| Need | Use |
|---|---|
| Marketing pages, blog, docs | Loader |
| Author dashboards, member areas | SDK |
| Search across collections | SDK |
| RSS, sitemap, OG cards | Loader |

### 3.4 Search

D1 SQLite FTS5 virtual table over `entries.content` (extracted plaintext) + `title` + `slug`. Indexed on write via a Drizzle trigger. Exposed as `vulse.search('query', { collections?, limit? })`. Good enough for hundreds of thousands of entries before we'd reach for a dedicated search service.

### 3.5 Preview mode

The admin's "Preview" button opens the user's site with a signed `vulse_preview` cookie. A small Astro middleware (shipped by the integration) detects it and switches loader/SDK reads to include drafts. Tokens are short-lived and scoped to the editor's session.

## 4. Admin UI

### 4.1 Route map (v1)

```
/admin                                  Dashboard
/admin/login                            Better Auth login
/admin/collections                      List of blueprints
/admin/collections/:name                Entry list
/admin/collections/:name/new            Create entry
/admin/collections/:name/:id            Edit entry
/admin/collections/:name/:id/revisions  Revision list, diff, restore
/admin/media                            Media library
/admin/users                            User list, invites
/admin/users/:id                        Edit user, role, reset password
/admin/settings                         Site settings (deploy hook, theme)
/admin/settings/auth                    Providers, allowed domains, sign-up toggle
```

### 4.2 Schema-driven forms

One `<EntryForm>` Vue island reads the blueprint's Zod schema and renders fields:

| Zod type | Renders as |
|---|---|
| `z.string()` | text input (textarea if `.max() > 200`) |
| `z.string().email()` | email input |
| `z.enum([...])` | select |
| `z.date()` | date picker |
| `z.boolean()` | toggle |
| `z.number()` | numeric input |
| `z.array(z.object({...}))` | repeater |
| `z.ref('user')` / `z.ref('post')` | typeahead picker against that collection |
| `z.media()` | media picker (modal → media library) |
| `blocks()` | block editor |
| `z.object({...})` | grouped fieldset |

### 4.3 Block editor

Ported from the current Vue editor as-is for v1. Mounted inside `<EntryForm>` when a field is `blocks()`. State serializes to the same JSON shape the existing zero-dep renderer reads, so the public-site `<BlockRenderer>` is shared code between admin preview and the user's pages.

### 4.4 Access control

Blueprint-declared functions (see Section 2.1). Enforced server-side as the source of truth; mirrored client-side only as UI affordance (hide a button if `create` returns false). The server never trusts UI gating.

Default roles: `admin`, `editor`, `member`. Self-signup defaults to `member`. Admins promote in `/admin/users`.

### 4.5 End-user auth surface

Not part of `/admin`. Vulse ships:

- `vulse.auth` SDK — `signIn`, `signUp`, `signOut`, `requestPasswordReset`, `useSession` (Vue composable + framework-agnostic primitive).
- A small set of **headless** Astro components / snippets users drop into their own pages — wiring only, no styled UI. The user owns presentation.
- Settings panel at `/admin/settings/auth` for providers, allowed domains, sign-up toggle.

### 4.6 Explicit non-goals for v1

- Multi-site / workspace switcher
- Workflow / approvals beyond draft → published
- Webhooks UI (deploy hook URL only)
- Plugin / extension marketplace
- In-app theming

## 5. Assets, ops, and install path

### 5.1 Upload flow

1. Admin requests a signed direct-upload URL from `/api/vulse/media/upload-url`.
2. Browser PUTs the file directly to R2 — no Worker proxying.
3. Admin posts the R2 key and metadata to `/api/vulse/media`, which writes the `media` row.
4. Dimensions extracted via image magic-byte probe (no full decode).
5. Blurhash generated lazily by a Cloudflare Queues consumer (optional; v1 falls back to none if Queues aren't configured).

### 5.2 Serving

Every `media` row exposes an `id` and a delivery URL:

```
https://imagedelivery.net/{ACCOUNT_HASH}/{id}/{variant}
```

Variants (`thumbnail`, `card`, `hero`, `og`) are defined once in Vulse settings and registered with the Cloudflare Images API during the first migration. Users reference media via the loader's resolved object or `vulse.media.url(id, 'card')`.

### 5.3 Lifecycle

Admin deletes do a soft-delete on the `media` row (`deleted_at`). A daily Cron Trigger purges R2 objects for rows soft-deleted >7 days ago. Protects against undo and against deleting assets still referenced by drafts.

### 5.4 Install path

`astro add vulse` runs an install hook that:

1. Appends the integration to `astro.config.mjs`.
2. Patches `wrangler.toml` (or creates it) with bindings:
   ```toml
   [[d1_databases]]      binding = "DB",      database_name = "vulse-db"
   [[r2_buckets]]        binding = "BUCKET",  bucket_name   = "vulse-media"
   [vars]                BETTER_AUTH_SECRET = "<generated>"
   ```
3. Generates `src/vulse/collections/.gitkeep` and a starter `page.ts` blueprint.
4. Generates `src/content/config.ts` wiring `vulseLoader` if it doesn't exist.
5. Prints a postinstall message with the exact one-time wrangler commands:
   ```
   wrangler d1 create vulse-db
   wrangler r2 bucket create vulse-media
   # paste IDs into wrangler.toml at the marked TODOs
   npx vulse migrate
   npx vulse seed:admin
   ```

After step 5, `astro dev` works. The postinstall message is the "first 5 minutes" UX — it must be tight, copy-pasteable, and survive common failures (e.g., wrangler not installed → message tells the user how to fix).

**Stretch / v1.x:** an interactive `create-vulse` (or extended `astro add` flow) that prompts for the D1 name and R2 bucket name, shells out to wrangler, and writes the resulting IDs back into `wrangler.toml` automatically. Eliminates the manual paste step. Deferred from v1 because solid docs cover the same ground; revisit once the rest of the surface is stable.

### 5.5 Migrations CLI

`npx vulse migrate` runs Drizzle migrations against whichever D1 the current wrangler context points at (local miniflare in dev, prod with `--remote`). Idempotent. Runs as part of the deploy build command.

### 5.6 Error handling

- API endpoints return a typed envelope: `{ ok: true, data } | { ok: false, error: { code, message, details? } }`. No throwing across the HTTP boundary.
- Validation errors carry field paths so the admin form can pin messages to inputs.
- Server-side: structured errors (`VulseError` subclasses — `ValidationError`, `AccessDeniedError`, `NotFoundError`, `ConflictError`). Anything else → 500 + logged stack, no internals leaked.
- Loader and SDK throw on programmer misuse, return `null` on expected absence (missing by id).

### 5.7 Env vars Vulse owns

| Var | Purpose | Required |
|---|---|---|
| `BETTER_AUTH_SECRET` | Better Auth signing secret | Yes (generated at install) |
| `BETTER_AUTH_URL` | Auto-derived from deploy URL, overridable | Optional |
| `VULSE_PREVIEW_SECRET` | Preview token signing | Yes (generated at install) |
| `CF_IMAGES_ACCOUNT_HASH` | Cloudflare Images delivery account | If using CF Images |
| `CF_IMAGES_TOKEN` | Cloudflare Images API token | If using CF Images |

Without Cloudflare Images credentials, Vulse soft-degrades to "originals only" — uploads still work, no variants.

## 6. Repo layout and testing

### 6.1 Repo layout (target after v1)

```
vulseastro/
├── packages/
│   └── vulse/                          ← published as `vulse` on npm
│       ├── src/
│       │   ├── core/                   ← Drizzle schema, blueprint registry, validators, repos
│       │   ├── server/                 ← API handlers, Better Auth, R2/Images, loader, SDK
│       │   ├── admin/                  ← Astro pages + Vue islands
│       │   ├── integration/            ← astro-integration entry, install hook
│       │   ├── cli/                    ← `vulse migrate`, `vulse seed:admin`
│       │   └── client/                 ← public API: vulseLoader, vulse SDK, BlockRenderer
│       ├── migrations/                 ← bundled Drizzle SQL migrations
│       ├── tests/
│       └── package.json
└── playground/
    └── vulse-play/                     ← existing Astro playground used as dev harness
```

Public exports (`vulse`, `vulse/loader`, `vulse/server`, `vulse/integration`) are declared as named `exports` in `package.json` so users can't reach into internals.

### 6.2 Testing strategy

**Unit (Vitest, no I/O).** Blueprint registration, Zod-to-form-field mapping, access-rule evaluation, block-tree serialization, slug generation, denormalized-column derivation. Runs on save.

**Integration (Vitest + miniflare D1).** The `server` layer against real D1 under miniflare (`@cloudflare/vitest-pool-workers`). Covers every API endpoint, the revision write path in transactions, Better Auth flows, R2 signed-URL generation, access rules end-to-end. **No mocking of D1, R2, or Better Auth.** Each test gets a fresh in-memory D1; migrations run once per suite.

**End-to-end (Playwright against `astro dev` in playground).** Critical journeys only:

- Install path: fresh playground → run install commands → log in → empty dashboard.
- Author journey: create `post` blueprint file → admin reflects it → create entry → upload image → publish → entry visible on public page.
- Revisions: edit twice → see two revisions → restore first → content reverts.
- Access: member account cannot reach admin; member-only content gated correctly.
- End-user auth: sign up as member, sign in, sign out.

Runs in CI against a preview-Worker deployment of the playground.

**Type tests (`tsd` / `expect-type`).** The generated `vulse.d.ts` is load-bearing. Tests assert generated types against fixture blueprints. Runs in CI.

### 6.3 Out of scope for v1 tests

- Visual regression on admin UI
- Load / perf benchmarks
- Cloudflare Images delivery (relying on CF SLOs)

### 6.4 CI

Single GitHub Actions workflow: typecheck → unit → integration → build playground → e2e. Drizzle migrations run on every CI job as part of the integration test bootstrap; broken migrations fail fast.

### 6.5 Coverage philosophy

No percentage targets. Required for v1:

- Every API endpoint has an integration test.
- Every blueprint field type (Section 4.2 table) has a unit test.
- Every e2e journey in 6.2 passes.

## 7. Open questions / deferred decisions

These are explicit deferrals, to be resolved during implementation planning or in v1.x:

- **Cloudflare Queues for blurhash generation** — optional in v1; if users haven't enabled Queues, blurhash is null. Decide later whether to fall back to on-the-fly Worker generation.
- **Revision retention policy** — v1 keeps all revisions forever. Pruning UI and policy in v1.1.
- **i18n** — `locale` column exists; only default locale wired in v1. Full i18n is v1.x.
- **Webhooks for content events** — out of scope. Deploy hook URL is the only outbound event in v1.
- **Field-level access control** — only entry-level access rules in v1. Per-field redaction is v1.x.
- **`field()` wrapper vs `.describe()` for display hints** — surface API decided during implementation.
