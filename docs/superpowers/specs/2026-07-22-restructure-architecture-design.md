# Vulse Restructure — Framework-Agnostic Core, Schema Control, Auth Isolation

**Date:** 2026-07-22
**Status:** Approved

## Problem

Vulse works, but four structural concerns block where the project wants to go:

1. **Framework coupling.** Vulse ships as an Astro integration. The goal is a
   framework-agnostic core with first-class Astro *and* Nuxt adapters.
2. **Schema control.** Moving from local development to production feels like losing
   control of the database schema.
3. **Better Auth dependency.** After its acquisition (by WorkOS), auth should be isolated
   behind an interface so it is swappable.
4. **Playground drift.** The playground app goes stale relative to the package.

### Diagnosis

- **Astro coupling is already contained.** The enforced seam (`tests/unit/astro-seam.test.ts`)
  keeps `src/core/**`, `src/server/routes/**`, `src/server/handler.ts`, and
  `src/server/runtime.ts` free of Astro imports, and route handlers already have the
  framework-free signature `(request: Request, rawParams) => Promise<Response>`. The
  Astro-coupled surfaces are the integration glue (47 injected API routes, middleware, Vite
  plugins), the thin endpoint shims, the Content Layer loader, and — the largest — the admin
  UI built as 28 Astro pages hosting ~35 Vue islands. Two hidden couplings the seam test
  misses: `src/server/env.ts` imports `cloudflare:workers` at module top, and
  `src/core/blueprints/load.ts` imports the Vite-ism `virtual:vulse-blueprints`.
- **The schema-control problem is not table migrations** (those transfer fine via
  `vulse migrate` → `wrangler d1 migrations apply`). The real causes:
  - The content model (collections/sets/globals) is stored as JSON rows in D1, seeded from
    code blueprints **create-only** (`blueprints/seed.ts` skips existing rows), so editing a
    code blueprint silently no-ops against any already-seeded database.
  - Admin-UI schema edits write only to whichever D1 you are pointed at — local/prod drift
    with no reconciliation.
  - The Drizzle journal listed 1 of 9 migration files, so a future `drizzle-kit generate`
    would have diffed against a stale snapshot and could emit destructive SQL.
  - Docs claimed a runtime auto-migration that does not exist.
- **Better Auth** is used narrowly (email+password, twoFactor plugin, a custom `user.role`
  column) and the shared handler touches it in exactly one place
  (`auth.api.getSession` in `server/handler.ts`). The client auth surface
  (`src/client/auth.ts`) is already plain fetch against `/api/auth/*`.

## Decisions

| Topic | Decision |
|---|---|
| Core | Framework-agnostic single `fetch` handler; Cloudflare (D1/R2/Workers) remains the platform |
| Adapters | First-class `@vulsecms/astro` and `@vulsecms/nuxt` |
| Auth | Keep Better Auth behind a small `AuthProvider` interface (it is MIT OSS, keeps user data in D1 — right for a self-hostable CMS) |
| Content model | **Code files are canonical** (Statamic model). DB registry hash-synced (upsert) from code. Admin-authored collections remain for prototyping; `schema:eject` bridges them into code |
| Admin UI | One standalone Vite-built Vue 3 SPA (vue-router); shell served by the core handler, hashed assets via each platform's static pipeline |
| Approach | Restructure in place (same repo, port existing code) — not greenfield |
| Playground | Becomes `examples/astro` + `examples/nuxt`, built in CI |

## Target package layout

```
packages/
  core/   @vulsecms/core   — engine + ONE fetch handler (better-auth, drizzle-orm, zod; NO astro/vue/vite)
  astro/  @vulsecms/astro  — integration, middleware, Content Layer loader, .astro components
  nuxt/   @vulsecms/nuxt   — Nuxt module, nitro handler, composables
  admin/  @vulsecms/admin  — Vite-built Vue 3 SPA; exports shellHtml + dist assets
  vue/    @vulsecms/vue    — frontend Vue renderers shared by Astro-with-Vue and Nuxt consumers
  cli/    @vulsecms/cli    — vulse bin (setup, migrate, seed:admin, schema:*, scaffold)
examples/
  astro/  (port of playground/vulse-play)    examples/nuxt/  (new minimal app)
```

`@vulsecms/core` keeps its name but its default export stops being an Astro integration
(major beta bump; consumers switch to `@vulsecms/astro`).

### The single fetch handler (`core/src/http/`)

```ts
createVulseHandler({
  getEnv,        // (request) => RuntimeEnv — kills the top-level cloudflare:workers import
  blueprints,    // adapter-injected — kills the virtual:vulse-blueprints import in core
  authProvider,  // defaults to betterAuthProvider
  admin,         // { shellHtml, basePath } — omit for headless installs
  plugins,
}): (request: Request) => Promise<Response>
```

- `routes-table.ts`: the 47-entry table ported verbatim from `integration/inject-routes.ts`
  (`[collection]` → `:collection`), matched by a small compiled regex table mirroring
  Astro's param semantics. Unmatched `/api/vulse/*` → the existing envelope 404.
- `/api/auth/*` → `authProvider.handler(request)`.
- `GET /admin(/**)`: session gate (302 to login / 403 by role — parity with today's
  middleware), then serve `shellHtml`.
- Adapters mount **three catch-all routes** instead of 47: `/api/vulse/[...path]`,
  `/api/auth/[...all]`, `/admin/[...rest]`. `/api/vulse` and `/admin` become documented
  reserved namespaces. A parity test replays every old pattern against the new router.
- With the admin prebuilt, `@astrojs/vue`, the Tailwind Vite plugin, the qrcode alias, and
  the admin-css plugin all disappear from the consumer's build.

### Nuxt adapter

Nuxt module registers: a nitro virtual module for blueprints from
`src/vulse/collections/*.ts` (same convention as Astro), `addServerHandler` for the three
namespaces calling the core handler via `toWebRequest(event)` +
`event.context.cloudflare?.env`, `nitro.publicAssets` for admin assets, and the shared
wrangler auto-patching from `@vulsecms/core/node`. Requires Nuxt ≥ 3.12 and the
`cloudflare_module` preset. Content delivery v1 is runtime SDK + nitro prerender (no
Content-Layer equivalent).

## Content-model sync (code canonical)

- Migration adds `vulse_collections.origin TEXT NOT NULL DEFAULT 'admin'` (`'code' | 'admin'`).
- `syncCodeBlueprints` replaces the create-only seed:
  - Fast path: manifest hash of all per-blueprint hashes vs a `vulse_settings` key — equal →
    return (one SELECT per cold start).
  - No row → create as `origin='code'`. Hash equal → no-op. Hash differs →
    `updateBlueprint` (reuses the existing `json_set`/`json_remove` entry-content rewrite in
    `blueprints/mutations.ts`). Field renames are declared in code:
    `defineCollection({ renames: { newField: 'oldField' } })`, filtered to applicable ones
    so they stay idempotent.
  - `origin='admin'` row with a handle that exists in code → **code adopts** (one-time
    warning, set `origin='code'`, update). This is the upgrade path that kills existing
    drift; made loud via `vulse schema:sync --dry-run` and release notes.
  - Orphans (`origin='code'`, handle gone from code) are never auto-deleted; surfaced on the
    status endpoint/admin banner and removed via `vulse schema:prune`.
  - Runs in `getRuntime()` cold start (behind the fast path) and explicitly via
    `vulse schema:sync [-c config] [--remote]` for deterministic deploys.
- Admin blueprint editor becomes read-only for `origin='code'` collections;
  `origin='admin'` stays fully editable for prototyping. `vulse schema:eject <handle>`
  generates a `defineCollection` file from a stored definition (inverse of
  `code-to-definition.ts`); the next sync adopts it. Admin-writes-to-files is out of scope
  for v1 — there is no faithful round-trip from a JSON definition into arbitrary
  user-authored TS+zod; eject (one-way, explicit) gives most of the value with none of the
  corruption risk.

## Auth isolation

```ts
interface AuthProvider {
  handler(request: Request): Promise<Response>              // mounted at /api/auth/*
  getSession(request: Request): Promise<VulseSession | null>
  users: { list; create; update; setRole; delete; requestPasswordReset }
  capabilities: { twoFactor: boolean; signUp: boolean; passwordReset: boolean }
}
```

Better Auth stays inside core as the default provider (`core/src/auth/better-auth/`); the
interface is the seam — a separate package pays off only when a second provider exists.
`defineHandler`'s first param narrows to `Pick<AuthProvider, 'getSession'>`. The
`/api/auth/*` path set used by `client/auth.ts` is frozen as Vulse's auth HTTP contract, so
login components survive any provider that serves it. The role model
(`admin`/`editor`/`member`) stays in core.

## Admin SPA

28 `.astro` pages become ~20 vue-router views; the ~35 Vue components port verbatim.
Post-build, `dist/index.html` is embedded as `shellHtml` (same trick as the live-preview
bridge embed). Server-side page data moves to two new routes: `GET /api/vulse/locales` and
`GET /api/vulse/status` (status + auth capabilities + sync orphans). Shell HTML is served by
the worker (auth-gated); hashed assets ride each framework's static pipeline (Astro: copied
into `outDir` at build, dev-served from node_modules; Nuxt: `nitro.publicAssets`). Rejected:
embedding assets in the worker (script-size limits) and KV (extra binding kills
zero-config). Contributor loop: Vite dev server proxying `/api` to a running example app.

## Sequencing

| # | Phase | Contents | Ships |
|---|---|---|---|
| 0 | Hygiene | Docs corrections, drizzle journal removal, quarantine test applier, schema-drift CI test, playground in CI | **done (this change)** |
| 1 | Handler extraction | `core/src/http/` router + routes-table, env/blueprint injection, integration → 3 catch-alls, seam test generalized | minor, no consumer change |
| 2 | Content sync | `origin` migration, `sync.ts`, adopt semantics, `renames`, `schema:sync/prune/eject`, read-only code collections, status/locales routes | minor — kills the drift |
| 3 | Package split | Moves per layout above; playground → `examples/astro`; CI builds every package + example | major beta |
| 4 | Auth provider | Interface + default provider extraction | with 3 or after |
| 5 | Admin SPA | Port views vertically (collections first) behind old pages until cut-over | major beta 2 |
| 6 | Nuxt adapter | Module + `examples/nuxt` + CI matrix | major beta 3 |
| 7 | Polish/GA | Themes story, upgrade guide, per-package docs | 1.0 |

## Risks

- Router param-semantics parity with Astro's router → covered by a parity test.
- Admin SPA port is the long pole; hidden server-side coupling surfaces as API calls with
  loading states. Port vertically; keep old pages until cut-over.
- Adopt-on-first-boot rewrites admin-edited definitions sharing a handle with code —
  intended, but made loud (dry-run, release notes).
- Hash canonicalization changes re-touch every row once → version the manifest key.
- `@vulsecms/core` default-export break → temporary throwing default export with a
  migration message in the first major beta.
