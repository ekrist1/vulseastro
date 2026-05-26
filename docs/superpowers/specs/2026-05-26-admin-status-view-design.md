# Admin Status View — Design

**Date:** 2026-05-26
**Status:** Approved (pending spec review)

## Problem

When using Vulse for Astro, there is no easy way to tell whether the admin panel is
operating against the **local development SQLite database** (Miniflare, via `astro dev`) or a
**remote production D1 database** (a deployed Worker). This is valuable during development —
to avoid mistaking which data you are about to mutate — and harmless but informative in
production. There is also no single place to confirm which Cloudflare bindings are wired or
which Vulse version is running.

## Constraint: detection is inferred, not probed

There is **no runtime API** that tells a Worker whether its D1 binding points at a local or
remote database — at runtime D1 is just a binding. The reliable signal is the **runtime
mode**:

- `astro dev` runs the admin SSR against Miniflare's **local SQLite** — `import.meta.env.DEV`
  is `true`.
- A built/deployed Worker uses the **remote D1** — `import.meta.env.PROD` is `true`.

The status view therefore reports **Environment: Development (local SQLite) / Production
(remote D1)**, derived from build mode. The UI states plainly that this reflects the runtime
mode rather than a direct database probe, so the framing is not misleading.

Admin pages are server-rendered `.astro` files that already read `env` and the D1 binding at
render time, so the status can be computed entirely server-side with no new client API.

## Approach

A **server-computed status object, pure SSR, no new API endpoint.** A small helper builds a
`VulseStatus` object from data already available in the worker during render. `AdminShell.astro`
computes it once and passes a compact slice to `SideNav` (for the always-visible badge); a new
Status page renders the full detail.

Alternatives considered and rejected:

- **`/api/vulse/status` endpoint + client polling** — status does not change within a request;
  polling adds complexity for no benefit.
- **Badge computed client-side** — impossible; it needs server-side `env` and build mode.

## Components

### 1. Status module — `src/server/status.ts`

A single function `getVulseStatus(env: RuntimeEnv): VulseStatus`:

```ts
interface VulseStatus {
  mode: 'development' | 'production'
  database: 'local SQLite' | 'remote D1'
  version: string
  bindings: { db: boolean; bucket: boolean; queue: boolean; images: boolean }
  warnings: string[]
}
```

- `mode` — `import.meta.env.DEV ? 'development' : 'production'`.
- `database` — `mode === 'development' ? 'local SQLite' : 'remote D1'`.
- `version` — `VULSE_VERSION` from `src/version.ts`.
- `bindings`:
  - `db` — `!!env.DB`
  - `bucket` — `!!env.BUCKET`
  - `queue` — `!!env.FORM_QUEUE`
  - `images` — `!!(env.CF_IMAGES_ACCOUNT_HASH && env.CF_IMAGES_TOKEN)`
- `warnings` — the agreed set of three checks:
  1. **Placeholder auth secret** — `env.BETTER_AUTH_SECRET === 'dev-secret-change-me-in-production-32chars'`.
  2. **Missing preview secret** — `!env.VULSE_PREVIEW_SECRET` (it falls back to
     `BETTER_AUTH_SECRET`, so this is an advisory, not an error).
  3. **Sign-up enabled in production** — `mode === 'production' && env.VULSE_ALLOW_MEMBER_SIGNUP === 'true'`.

`import.meta.env.DEV` is read inside this module so it is the single source of truth for mode.

### 2. Sidebar badge — `SideNav.vue`

A new optional `status` prop carrying `{ mode, database, warningCount }`. Rendered as a small
pill beneath the logo:

- Development — **amber** styling, text `DEV · local DB`.
- Production — neutral/muted styling, text `PROD · remote D1`.
- If `warningCount > 0`, a ⚠ marker is appended.

The badge renders for any signed-in user (it carries no secrets — only mode and DB label). It
links to `/admin/settings/status` **only when the user is an admin** (the same `isAdmin` flag
`SideNav` already receives); for non-admins it is a non-interactive pill, avoiding a dead link
to an admin-only page.

### 3. Status page — `src/admin/pages/settings/status.astro`

Admin-only page (consistent with Site/Auth settings gating) at `/admin/settings/status`.
Renders:

- **Environment** — mode + database label, with a one-line note that this reflects runtime
  mode, not a direct DB probe.
- **Version** — the installed `@vulsecms/core` version.
- **Bindings** — a checklist of D1 / R2 / Queue / Images with ✓ (present) or ✗ (absent).
- **Warnings** — the `warnings` list; rendered as an empty/"all clear" state when none.

Production uses neutral styling throughout (no alarm colors except the warnings list).

A nav link **Status** is added to the Settings group in `SideNav.vue`, alongside Site and
Auth, gated by `isAdmin`.

### 4. Wiring — `AdminShell.astro`

`AdminShell.astro` already computes `env` and `isAdmin`. It calls `getVulseStatus(env)` and
passes `{ mode, database, warningCount: warnings.length }` into `SideNav` as the `status` prop.

## Data flow

```
AdminShell.astro (SSR, per request)
  └─ getVulseStatus(env)  →  VulseStatus
       ├─ badge slice → SideNav.vue  (pill under logo, all users)
       └─ full object → settings/status.astro (admin-only page)
```

No client fetch; no new endpoint. Everything is computed during the existing SSR pass.

## Error handling

- `getVulseStatus` performs only presence/equality checks on `env` and never throws.
  `AdminShell` already calls `getRuntimeEnv()` (which throws on a missing `DB`/secret) before
  reaching the status code, so a broken environment fails earlier with its existing error.
- The badge degrades gracefully: if the `status` prop is absent, `SideNav` renders without it.

## Testing

Unit tests for `getVulseStatus` (the bulk of the logic):

- `mode`/`database` mapping for dev and production.
- `bindings` permutations: each of DB/BUCKET/FORM_QUEUE present/absent; Images requires both
  `CF_IMAGES_ACCOUNT_HASH` and `CF_IMAGES_TOKEN`.
- Each warning condition fires independently and only when its trigger is met (e.g. sign-up
  warning only in production).
- No warnings → empty array.

The Vue/Astro rendering is thin and covered by existing admin sanity tests; no new
component-level tests required beyond the module unit tests.

## Out of scope (YAGNI)

- Live/auto-refreshing status or a status API.
- Pending-migration detection, content counts, or D1 size metrics on this view.
- Surfacing secrets values (only presence/placeholder checks).
