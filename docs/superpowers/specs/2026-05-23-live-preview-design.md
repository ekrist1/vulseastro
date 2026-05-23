# Vulse Live Preview — Design Spec

**Status:** Approved  
**Date:** 2026-05-23  
**Author:** Espen (with Claude)  
**Depends on:** [Vulse for Astro v1 Design Spec](./2026-05-23-vulseastro-design.md) §3.5 (preview mode), Plan 6 (preview cookie + middleware)

## Vision

Editors see **almost-instant** updates on the **real public page template** as they type in the admin — without autosaving to `entries`. Unsaved form state lives in a short-lived **preview session** (Statamic-style). The admin panel hosts a split-view iframe; the public site receives `postMessage` events and soft-refreshes via fetch + DOM morph.

---

## Decisions locked in

| # | Decision |
|---|----------|
| 1 | **No autosave** — live preview never writes to `entries` or `entry_revisions`. Only explicit Save/Publish touches the database. |
| 2 | **Preview sessions in D1** — ephemeral rows keyed by unguessable token; TTL 1 hour; purged by cron. |
| 3 | **Statamic-style postMessage + soft refresh** — admin PUTs session, posts `{ name: 'vulse.preview.updated' }`, iframe fetches same URL and morphs DOM (not full iframe reload). |
| 4 | **Auto-injected bridge** — vulse integration injects the bridge script on HTML responses when a live preview token is active. No user boilerplate required for the default case. |
| 5 | **SSR required** — live preview works on SSR pages (`output: 'server'`). Loader-only SSG pages are out of scope for v1; documented as limitation. |
| 6 | **Coexists with preview cookie** — existing `vulse_preview` cookie (saved drafts) remains. Content resolution priority: **live session → saved draft → published**. |
| 7 | **v1 scope: collection entries only** — globals/forms live preview deferred to v1.x. |

Additional defaults:

| Area | Decision |
|------|----------|
| Debounce | 100 ms on admin session PUT (typing feel) |
| Morph target | `main` by default; overridable via `preview.rootSelector` on blueprint |
| Bridge script | Served at `/api/vulse/preview/bridge.js`; morphdom bundled inline |
| Session auth | Create/update/delete require `admin` or `editor` role |
| Page render auth | Valid session token + editor session cookie **or** valid `vulse_preview` cookie |
| New entries | Session works with provisional slug before first save; `entry_id` nullable |
| `noindex` | `X-Robots-Tag: noindex, nofollow` on live-preview HTML responses |

---

## 1. Goals (v1)

1. **Admin:** Split-panel live preview beside entry editor; updates as you type; no DB writes.
2. **Public:** Real page templates render session override content; bridge morphs DOM on update (~100–200 ms perceived latency).
3. **DX:** `resolvePreviewContent()` helper replaces hand-rolled `isPreview && draftContent` checks; scaffolds updated.
4. **Ops:** Cron purges expired preview sessions.

---

## 2. Architecture

### 2.1 Data flow

```
EntryForm (admin)
  │ field change
  ▼ debounce 100 ms
PUT /api/vulse/preview/sessions/:id   ← content JSON, slug (no entries write)
  │
  ├── postMessage → iframe { name: 'vulse.preview.updated', token }
  │
  ▼
iframe: /blog/my-slug?vulse_live_preview=<token>
  │
  ▼ bridge listener
fetch(same URL, { cache: 'no-store' })
  │
  ▼ middleware reads token → loads session → Astro.locals.vulseLivePreview
SSR page → resolvePreviewContent(entry, locals) → rendered HTML
  │
  ▼ morphdom
DOM updated (scroll/focus preserved)
```

### 2.2 Layer placement

| Layer | Responsibility |
|-------|----------------|
| `core` | `vulse_preview_sessions` schema, `PreviewSessionsRepo`, `resolvePreviewContent()` |
| `server` | Session CRUD routes, bridge.js endpoint, cron purge |
| `integration` | Middleware: read token, set locals, inject bridge script + `noindex` on HTML |
| `admin` | `LivePreviewPanel.vue`, wire `EntryForm` → session PUT + postMessage |
| `client` | Bridge script source (morphdom); no user-facing component required |

### 2.3 Relationship to existing preview

| Mechanism | Purpose | Writes DB? |
|-----------|---------|------------|
| Preview button + `vulse_preview` cookie | View **saved** draft in new tab | Only if user saved |
| Live preview + `vulse_live_preview` token | View **unsaved** editor state inline | **Never** |

Both can be active. `resolvePreviewContent()` applies priority: live session wins when `entryId` matches.

---

## 3. Data model

### 3.1 Migration `0006_preview_sessions.sql`

```sql
CREATE TABLE vulse_preview_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_id TEXT,
  collection TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX vulse_preview_sessions_expires ON vulse_preview_sessions(expires_at);
CREATE INDEX vulse_preview_sessions_user ON vulse_preview_sessions(user_id);
```

- `id`: nanoid(32) — URL token
- `entry_id`: nullable (new unsaved entries)
- `content`: JSON blob mirroring entry `content` shape (not wrapped)
- `expires_at`: unix ms; default now + 1 hour; extended on each PUT

---

## 4. API

### 4.1 Routes

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| `POST` | `/api/vulse/preview/sessions` | editor+ | `{ collection, entryId?, slug, content }` | `{ id, previewUrl, expiresAt }` |
| `PUT` | `/api/vulse/preview/sessions/:id` | editor+ (owner) | `{ slug?, content }` | `{ ok, expiresAt }` |
| `DELETE` | `/api/vulse/preview/sessions/:id` | editor+ (owner) | — | `{ ok }` |
| `GET` | `/api/vulse/preview/bridge.js` | public | — | JS (bridge + morphdom) |

`previewUrl` = `{origin}{preview.path with slug}?vulse_live_preview={id}`

Preview path comes from blueprint `preview.path` (default `/{slug}`).

### 4.2 Session ownership

- `POST` sets `user_id` from auth session.
- `PUT`/`DELETE` reject if `session.user_id !== auth.user.id` (403).
- Page render: session token valid **and** not expired **and** (`vulse_preview` cookie valid **or** authenticated editor with matching `user_id`).

This prevents token leakage from exposing draft content to anonymous visitors.

---

## 5. Middleware & content resolution

### 5.1 Token detection

On every request, middleware reads:

1. Query param `vulse_live_preview`
2. Cookie `vulse_live_preview` (set on first visit so morph fetches work without re-appending query string)

If token present and session valid + auth check passes:

```ts
ctx.locals.vulseLivePreview = {
  token: string
  entryId: string | null
  collection: string
  slug: string
  content: Record<string, unknown>
}
```

Existing `vulse_preview` cookie logic unchanged (`ctx.locals.vulsePreview = true`).

### 5.2 `resolvePreviewContent()`

```ts
export function resolvePreviewContent(
  entry: { id: string; content: unknown; draftContent?: unknown | null } | null,
  locals: {
    vulseLivePreview?: { entryId: string | null; content: unknown } | null
    vulsePreview?: boolean
  },
): unknown | null {
  const live = locals.vulseLivePreview
  if (live && entry && live.entryId === entry.id) return live.content
  if (locals.vulsePreview && entry?.draftContent != null) return entry.draftContent
  return entry?.content ?? null
}
```

For **new entries** (`entryId` null): match by `collection` + `slug` from session against the page being rendered. If the page's collection/slug match session metadata, use session content even before an entry row exists (404 otherwise unless page handles empty state).

### 5.3 HTML response handling

When `vulseLivePreview` is set and response `Content-Type` is `text/html`:

1. Set `X-Robots-Tag: noindex, nofollow`
2. Inject before `</body>`:

```html
<script type="module" src="/api/vulse/preview/bridge.js" data-vulse-live-preview></script>
```

Implementation: middleware wraps `next()`, reads response body if HTML, splices script tag. Skip for non-HTML and `/admin/*`.

### 5.4 Bridge script behaviour

```js
// vulse.preview.updated
window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin) return
  if (event.data?.name !== 'vulse.preview.updated') return

  const res = await fetch(location.href, { cache: 'no-store', credentials: 'include' })
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const selector = document.documentElement.dataset.vulsePreviewRoot ?? 'main'
  const from = doc.querySelector(selector)
  const to = document.querySelector(selector)
  if (from && to) morphdom(to, from)
})
```

`morphdom` shipped as dependency, bundled into `bridge.js`.

Blueprint override:

```ts
preview?: {
  path: string
  rootSelector?: string  // default 'main'
  live?: boolean         // default true; false = disable live panel for this collection
}
```

When `live: false`, admin hides split panel (Preview link still works for saved drafts).

---

## 6. Admin UI

### 6.1 Layout

Entry edit page (`/admin/collections/:name/:id`) becomes a responsive split:

```
┌─────────────────────────┬─────────────────────────┐
│ EntryForm               │ LivePreviewPanel        │
│ (existing)              │ ┌─────────────────────┐ │
│                         │ │ iframe → previewUrl │ │
│                         │ └─────────────────────┘ │
│                         │ [Open in tab] [↻ reload]│
└─────────────────────────┴─────────────────────────┘
```

- `xl` breakpoint: side-by-side (50/50)
- Below `xl`: stacked; preview collapsible (default open on desktop)
- Toolbar: "Open in tab" uses existing `/api/vulse/preview/start?to=…` (saved draft flow)

### 6.2 `LivePreviewPanel.vue`

**Props:** `collection`, `entryId?`, `previewPath`, `slug`, `rootSelector?`

**Emits:** none (parent passes content via callback ref or shared composable)

**Lifecycle:**

1. `onMounted`: `POST /api/vulse/preview/sessions` → set iframe `src` to `previewUrl`
2. Parent calls `panel.pushUpdate({ content, slug })` on field changes (debounced 100 ms inside panel)
3. `pushUpdate`: `PUT` session → `iframe.contentWindow.postMessage(...)`
4. If slug changed: update iframe `src` to new preview URL (new fetch, then resume morph updates)
5. `onUnmounted`: `DELETE` session (best-effort)

### 6.3 `EntryForm` changes

- Emit `preview-change` with `{ content, slug }` on every field update (immediate; panel debounces)
- No change to save/publish behaviour

---

## 7. Blueprint config extension

```ts
preview?: {
  /** URL template. `{slug}` replaced with entry slug. Default: '/{slug}' */
  path: string
  /** DOM selector morph target. Default: 'main' */
  rootSelector?: string
  /** Enable split-panel live preview. Default: true */
  live?: boolean
}
```

---

## 8. Security

| Threat | Mitigation |
|--------|------------|
| Token guessing | 32-char nanoid; rate-limit not needed at this entropy |
| Token shared publicly | Requires editor auth cookie or valid preview cookie to render |
| XSS via session content | Content rendered through existing Astro escape paths; no `innerHTML` of raw fields in bridge |
| Session fixation | New session per panel mount; DELETE on unmount |
| Stale sessions | 1 h TTL; cron purge |

---

## 9. Limitations & follow-ups

| Limitation | v1 handling |
|------------|-------------|
| Loader/SSG pages | Document: live preview requires SSR. Preview button (saved draft) may still work if page has SSR fallback. |
| Globals / forms editors | Deferred v1.x — same session pattern |
| Custom layouts without `<main>` | Set `preview.rootSelector` |
| Very large pages | Full HTML fetch on each update; acceptable for v1 (Statamic same approach) |
| Cross-origin admin/site | Out of scope — vulse assumes monorepo same origin |

---

## 10. Testing

| Area | Tests |
|------|-------|
| `PreviewSessionsRepo` | create, update, find, delete, purge expired, ownership |
| `resolvePreviewContent` | live override, draft fallback, published default, null entry |
| Session routes | auth, 403 wrong owner, TTL extension |
| Middleware | token → locals; HTML injection; noindex header |
| Bridge | unit test morph target selection (jsdom) |
| Playground | manual: edit page title, see iframe update < 200 ms |

---

## 11. Documentation updates

- `packages/vulse/README.MD`: Live Preview section (session vs cookie preview, SSR requirement, `resolvePreviewContent`, `preview.rootSelector`)
- Scaffold `generateShowPage()`: use `resolvePreviewContent()`
- Playground `[slug].astro`: migrate to helper

---

## 12. Out of scope (v1)

- Globals live preview
- Forms live preview
- Loader build-time draft preview
- Device viewport presets in panel (nice-to-have v1.x)
- Revision history entries from preview
