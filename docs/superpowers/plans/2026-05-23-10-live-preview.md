# Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors see almost-instant live preview of unsaved entry content in a split-panel iframe, using Statamic-style preview sessions (no autosave), postMessage, fetch, and DOM morph.

**Architecture:** Unsaved editor state is stored in D1 `vulse_preview_sessions` keyed by URL token. Middleware loads session into `Astro.locals.vulseLivePreview`. Pages use `resolvePreviewContent()`. Admin debounces session PUTs and postMessages the iframe; an auto-injected bridge script fetches HTML and morphs `main`.

**Tech Stack:** D1 + Drizzle, morphdom, existing preview cookie (`jose`), Vue 3 admin panel, Astro middleware HTML injection.

**Spec reference:** [Live Preview Design Spec](../specs/2026-05-23-live-preview-design.md)

**Prerequisites:** Plans 1–6 complete (preview cookie + middleware exist).

---

## File map

| File | Responsibility |
|------|----------------|
| `migrations/0006_preview_sessions.sql` | Session table |
| `core/schema.ts` | Drizzle table definition |
| `core/repos/preview-sessions.ts` | CRUD + purge |
| `core/preview-content.ts` | `resolvePreviewContent()` |
| `server/routes/preview-sessions.ts` | Session API handlers |
| `server/routes/preview-bridge.ts` | Serves bridge.js bundle |
| `server/endpoints/api-vulse-preview-sessions*.ts` | Astro route adapters |
| `server/endpoints/api-vulse-preview-bridge.ts` | Bridge endpoint |
| `integration/middleware.ts` | Token → locals, HTML inject, noindex |
| `admin/components/LivePreviewPanel.vue` | Split-panel iframe |
| `admin/components/EntryForm.vue` | Emit `preview-change` |
| `admin/pages/collections/[name]/[id].astro` | Split layout |
| `client/live-preview-bridge.ts` | Bridge source (bundled to endpoint) |
| `core/blueprints/types.ts` | Extend `PreviewConfig` |

---

### Task 1: Migration + schema + PreviewSessionsRepo

**Files:**
- Create: `packages/vulse/migrations/0006_preview_sessions.sql`
- Modify: `packages/vulse/src/core/migrations.ts`
- Modify: `packages/vulse/src/core/schema.ts`
- Create: `packages/vulse/src/core/repos/preview-sessions.ts`
- Create: `packages/vulse/tests/integration/preview-sessions-repo.test.ts`

- [ ] **Step 1: Write migration**

`packages/vulse/migrations/0006_preview_sessions.sql`:

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
--> statement-breakpoint
CREATE INDEX vulse_preview_sessions_expires ON vulse_preview_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX vulse_preview_sessions_user ON vulse_preview_sessions(user_id);
```

- [ ] **Step 2: Register migration**

In `packages/vulse/src/core/migrations.ts`, import and append:

```ts
import previewSessionsSql from '../../migrations/0006_preview_sessions.sql?raw'

// in MIGRATIONS array:
{ id: '0006_preview_sessions', sql: previewSessionsSql },
```

- [ ] **Step 3: Add Drizzle table**

In `packages/vulse/src/core/schema.ts`:

```ts
export const vulsePreviewSessions = sqliteTable('vulse_preview_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  entryId: text('entry_id'),
  collection: text('collection').notNull(),
  slug: text('slug').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  byExpires: index('vulse_preview_sessions_expires').on(t.expiresAt),
  byUser: index('vulse_preview_sessions_user').on(t.userId),
}))
```

- [ ] **Step 4: Write failing repo test**

`packages/vulse/tests/integration/preview-sessions-repo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations.js'
import { createDb } from '../../src/core/db.js'
import { PreviewSessionsRepo } from '../../src/core/repos/preview-sessions.js'

describe('PreviewSessionsRepo', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('creates and finds a session', async () => {
    const repo = new PreviewSessionsRepo(createDb(env.DB))
    const row = await repo.create({
      userId: 'u1',
      collection: 'page',
      slug: 'about',
      content: { title: 'About', body: [] },
      entryId: 'e1',
    })
    expect(row.id).toBeTruthy()
    const found = await repo.findById(row.id)
    expect(found?.slug).toBe('about')
    expect(found?.content).toEqual({ title: 'About', body: [] })
  })

  it('purges expired sessions', async () => {
    const repo = new PreviewSessionsRepo(createDb(env.DB))
    const row = await repo.create({
      userId: 'u1',
      collection: 'page',
      slug: 'old',
      content: { title: 'Old' },
      ttlMs: -1000,
    })
    const purged = await repo.purgeExpired(new Date())
    expect(purged).toBe(1)
    expect(await repo.findById(row.id)).toBeNull()
  })
})
```

- [ ] **Step 5: Run test — expect FAIL**

Run: `pnpm --filter vulse test tests/integration/preview-sessions-repo.test.ts`

- [ ] **Step 6: Implement repo**

`packages/vulse/src/core/repos/preview-sessions.ts`:

```ts
import { nanoid } from 'nanoid'
import { eq, lt } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulsePreviewSessions } from '../schema.js'

const DEFAULT_TTL_MS = 60 * 60 * 1000

export interface PreviewSessionRow {
  id: string
  userId: string
  entryId: string | null
  collection: string
  slug: string
  content: unknown
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

function mapRow(row: typeof vulsePreviewSessions.$inferSelect): PreviewSessionRow {
  return {
    id: row.id,
    userId: row.userId,
    entryId: row.entryId ?? null,
    collection: row.collection,
    slug: row.slug,
    content: row.content,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PreviewSessionsRepo {
  constructor(private db: VulseDb) {}

  async create(input: {
    userId: string
    collection: string
    slug: string
    content: unknown
    entryId?: string | null
    ttlMs?: number
  }): Promise<PreviewSessionRow> {
    const now = new Date()
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS
    const id = nanoid(32)
    const row = {
      id,
      userId: input.userId,
      entryId: input.entryId ?? null,
      collection: input.collection,
      slug: input.slug,
      content: input.content,
      expiresAt: new Date(now.getTime() + ttl),
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(vulsePreviewSessions).values(row)
    return mapRow(row)
  }

  async findById(id: string): Promise<PreviewSessionRow | null> {
    const row = await this.db.query.vulsePreviewSessions.findFirst({
      where: eq(vulsePreviewSessions.id, id),
    })
    if (!row) return null
    if (row.expiresAt.getTime() < Date.now()) return null
    return mapRow(row)
  }

  async update(id: string, userId: string, patch: { slug?: string; content?: unknown }): Promise<PreviewSessionRow | null> {
    const existing = await this.findById(id)
    if (!existing || existing.userId !== userId) return null
    const now = new Date()
    const next = {
      slug: patch.slug ?? existing.slug,
      content: patch.content ?? existing.content,
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS),
      updatedAt: now,
    }
    await this.db.update(vulsePreviewSessions).set(next).where(eq(vulsePreviewSessions.id, id))
    return { ...existing, ...next }
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await this.findById(id)
    if (!existing || existing.userId !== userId) return false
    await this.db.delete(vulsePreviewSessions).where(eq(vulsePreviewSessions.id, id))
    return true
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const expired = await this.db.select({ id: vulsePreviewSessions.id })
      .from(vulsePreviewSessions)
      .where(lt(vulsePreviewSessions.expiresAt, now))
    for (const row of expired) {
      await this.db.delete(vulsePreviewSessions).where(eq(vulsePreviewSessions.id, row.id))
    }
    return expired.length
  }
}
```

Ensure `vulsePreviewSessions` is registered in Drizzle schema relations/query if needed (follow `entries` pattern in `db.ts`).

- [ ] **Step 7: Run test — expect PASS**

Run: `pnpm --filter vulse test tests/integration/preview-sessions-repo.test.ts`

- [ ] **Step 8: Commit**

```bash
git add packages/vulse/migrations/0006_preview_sessions.sql packages/vulse/src/core/migrations.ts packages/vulse/src/core/schema.ts packages/vulse/src/core/repos/preview-sessions.ts packages/vulse/tests/integration/preview-sessions-repo.test.ts
git commit -m "feat(vulse): preview sessions table and repo"
```

---

### Task 2: resolvePreviewContent helper

**Files:**
- Create: `packages/vulse/src/core/preview-content.ts`
- Create: `packages/vulse/tests/unit/preview-content.test.ts`
- Modify: `packages/vulse/src/server/index.ts` (re-export)

- [ ] **Step 1: Write failing unit test**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePreviewContent } from '../../src/core/preview-content.js'

describe('resolvePreviewContent', () => {
  const entry = {
    id: 'e1',
    content: { title: 'Published' },
    draftContent: { title: 'Draft' },
  }

  it('prefers live session when entryId matches', () => {
    const out = resolvePreviewContent(entry, {
      vulseLivePreview: { entryId: 'e1', content: { title: 'Live' } },
    })
    expect(out).toEqual({ title: 'Live' })
  })

  it('falls back to draft when preview cookie set', () => {
    const out = resolvePreviewContent(entry, { vulsePreview: true })
    expect(out).toEqual({ title: 'Draft' })
  })

  it('returns published content by default', () => {
    expect(resolvePreviewContent(entry, {})).toEqual({ title: 'Published' })
  })
})
```

- [ ] **Step 2: Implement**

`packages/vulse/src/core/preview-content.ts`:

```ts
export interface VulseLivePreviewLocals {
  entryId: string | null
  collection: string
  slug: string
  content: unknown
}

export interface PreviewLocals {
  vulseLivePreview?: VulseLivePreviewLocals | null
  vulsePreview?: boolean
}

export function resolvePreviewContent(
  entry: { id: string; content: unknown; draftContent?: unknown | null } | null,
  locals: PreviewLocals,
): unknown | null {
  const live = locals.vulseLivePreview
  if (live && entry && live.entryId === entry.id) return live.content
  if (locals.vulsePreview && entry?.draftContent != null) return entry.draftContent
  return entry?.content ?? null
}
```

Export from `packages/vulse/src/server/index.ts`:

```ts
export { resolvePreviewContent, type VulseLivePreviewLocals, type PreviewLocals } from '../core/preview-content.js'
```

- [ ] **Step 3: Run test — expect PASS**

Run: `pnpm --filter vulse test tests/unit/preview-content.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/core/preview-content.ts packages/vulse/tests/unit/preview-content.test.ts packages/vulse/src/server/index.ts
git commit -m "feat(vulse): resolvePreviewContent helper"
```

---

### Task 3: Session API routes

**Files:**
- Create: `packages/vulse/src/server/routes/preview-sessions.ts`
- Create: `packages/vulse/src/server/endpoints/api-vulse-preview-sessions.ts`
- Create: `packages/vulse/src/server/endpoints/api-vulse-preview-sessions-id.ts`
- Modify: `packages/vulse/src/integration/inject-routes.ts`
- Modify: `packages/vulse/src/server/runtime.ts`
- Create: `packages/vulse/tests/integration/preview-sessions-routes.test.ts`

- [ ] **Step 1: Write failing route test**

Test creates session via POST with mocked auth (follow `forms-routes.test.ts` pattern).

- [ ] **Step 2: Implement `previewSessionsRoutes`**

`packages/vulse/src/server/routes/preview-sessions.ts`:

```ts
import { z } from 'astro/zod'
import type { Auth } from '../better-auth.js'
import type { VulseDb } from '../../core/db.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { defineHandler } from '../handler.js'
import { PreviewSessionsRepo } from '../../core/repos/preview-sessions.js'
import { AccessDeniedError, NotFoundError } from '../../core/errors.js'

function buildPreviewUrl(origin: string, pathTemplate: string, slug: string, token: string): string {
  const path = pathTemplate.replace('{slug}', encodeURIComponent(slug))
  const url = new URL(path, origin)
  url.searchParams.set('vulse_live_preview', token)
  return url.toString()
}

export function previewSessionsRoutes(db: VulseDb, auth: Auth, registry: BlueprintRegistry) {
  const repo = new PreviewSessionsRepo(db)

  return {
    create: defineHandler(auth, {
      requireRole: ['admin', 'editor'],
      body: z.object({
        collection: z.string(),
        entryId: z.string().nullable().optional(),
        slug: z.string(),
        content: z.record(z.unknown()),
      }),
    }, async ({ auth: ctx, body, url }) => {
      const bp = registry.get(body.collection)
      if (!bp) throw new NotFoundError(`Collection ${body.collection} not found`)
      const row = await repo.create({
        userId: ctx.user!.id,
        collection: body.collection,
        slug: body.slug,
        content: body.content,
        entryId: body.entryId ?? null,
      })
      const previewPath = bp.preview?.path ?? '/{slug}'
      return {
        id: row.id,
        previewUrl: buildPreviewUrl(url.origin, previewPath, row.slug, row.id),
        expiresAt: row.expiresAt.toISOString(),
      }
    }),

    update: defineHandler(auth, {
      requireRole: ['admin', 'editor'],
      params: z.object({ id: z.string() }),
      body: z.object({
        slug: z.string().optional(),
        content: z.record(z.unknown()).optional(),
      }),
    }, async ({ auth: ctx, params, body }) => {
      const updated = await repo.update(params.id, ctx.user!.id, body)
      if (!updated) throw new AccessDeniedError('Session not found or not owned by you')
      return { expiresAt: updated.expiresAt.toISOString() }
    }),

    remove: defineHandler(auth, {
      requireRole: ['admin', 'editor'],
      params: z.object({ id: z.string() }),
    }, async ({ auth: ctx, params }) => {
      const ok = await repo.delete(params.id, ctx.user!.id)
      if (!ok) throw new NotFoundError('Session not found')
      return { ok: true }
    }),
  }
}
```

Wire into `runtime.ts`:

```ts
import { previewSessionsRoutes } from './routes/preview-sessions.js'
// in routes:
previewSessions: previewSessionsRoutes(db, auth, registry),
```

- [ ] **Step 3: Add Astro endpoints**

`api-vulse-preview-sessions.ts`:

```ts
import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const POST: APIRoute = async ({ request }) => {
  const rt = await withRuntime(request)
  return rt.routes.previewSessions.create(request)
}
```

`api-vulse-preview-sessions-id.ts`:

```ts
import type { APIRoute } from 'astro'
import { withRuntime } from './with-runtime.js'

export const ALL: APIRoute = async ({ request, params }) => {
  const rt = await withRuntime(request)
  const id = params.id!
  if (request.method === 'PUT') return rt.routes.previewSessions.update(request, { id })
  if (request.method === 'DELETE') return rt.routes.previewSessions.remove(request, { id })
  return new Response('Method Not Allowed', { status: 405 })
}
```

- [ ] **Step 4: Inject routes**

In `inject-routes.ts`, add:

```ts
{ pattern: '/api/vulse/preview/sessions', file: 'api-vulse-preview-sessions.js' },
{ pattern: '/api/vulse/preview/sessions/[id]', file: 'api-vulse-preview-sessions-id.js' },
```

- [ ] **Step 5: Run integration test — expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(vulse): preview session CRUD API"
```

---

### Task 4: Middleware — load session + HTML injection

**Files:**
- Modify: `packages/vulse/src/integration/middleware.ts`
- Create: `packages/vulse/tests/integration/live-preview-middleware.test.ts`

- [ ] **Step 1: Extend middleware (token → locals)**

After existing preview cookie block, add:

```ts
import { PreviewSessionsRepo } from '../core/repos/preview-sessions.js'
import { createDb } from '../core/db.js'
import { previewSecret, verifyPreviewToken } from '../server/preview.js'

// inside onRequest, after env available:
const liveToken =
  url.searchParams.get('vulse_live_preview')
  ?? (ctx.request.headers.get('cookie') ?? '').match(/vulse_live_preview=([^;]+)/)?.[1]

if (liveToken) {
  const db = createDb(env.DB)
  const session = await new PreviewSessionsRepo(db).findById(liveToken)
  if (session) {
    const previewCookie = (ctx.request.headers.get('cookie') ?? '').match(/vulse_preview=([^;]+)/)?.[1]
    const previewOk = previewCookie && await verifyPreviewToken(previewSecret(env), previewCookie)
    const vulseUser = (ctx.locals as { vulseUser?: { id: string } }).vulseUser
    const ownerOk = vulseUser?.id === session.userId
    if (previewOk || ownerOk) {
      ;(ctx.locals as { vulseLivePreview?: typeof session }).vulseLivePreview = {
        entryId: session.entryId,
        collection: session.collection,
        slug: session.slug,
        content: session.content,
      }
    }
  }
}
```

Note: admin routes already set `vulseUser` for `/admin/*`; for public pages, editor must have active session cookie from Better Auth **or** valid `vulse_preview` cookie. On first live preview mount, admin should also hit `/api/vulse/preview/start?to=…&embed=1` (see Task 6) to set preview cookie, **or** rely on Better Auth session cookie being sent to iframe (same origin — it will be).

Same-origin iframe includes auth cookies → `ownerOk` works for logged-in editors without extra preview cookie. Document both paths; implement owner check via optional session lookup:

```ts
// For public pages, resolve editor session if not already on locals:
let userId: string | null = (ctx.locals as { vulseUser?: { id: string } }).vulseUser?.id ?? null
if (!userId && session) {
  const rt = await getRuntime(env, await registryForRequest(db), url.origin)
  const s = await rt.auth.api.getSession({ headers: ctx.request.headers })
  userId = s?.user?.id ?? null
}
const ownerOk = userId === session.userId
```

- [ ] **Step 2: Set live preview cookie on first visit**

If token came from query param and session valid, append to response (in HTML injection step):

```
Set-Cookie: vulse_live_preview=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600
```

- [ ] **Step 3: HTML injection wrapper**

After `const response = await next()`:

```ts
const live = (ctx.locals as { vulseLivePreview?: unknown }).vulseLivePreview
if (live && response.headers.get('content-type')?.includes('text/html')) {
  const html = await response.text()
  const injected = html.replace(
    '</body>',
    '<script type="module" src="/api/vulse/preview/bridge.js"></script></body>',
  )
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  // append live preview cookie if needed
  return new Response(injected, { status: response.status, headers })
}
return response
```

- [ ] **Step 4: Write + run middleware test**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vulse): live preview middleware and HTML bridge injection"
```

---

### Task 5: Bridge script + endpoint

**Files:**
- Create: `packages/vulse/src/client/live-preview-bridge.ts`
- Create: `packages/vulse/src/server/routes/preview-bridge.ts`
- Create: `packages/vulse/src/server/endpoints/api-vulse-preview-bridge.ts`
- Modify: `packages/vulse/package.json` (add `morphdom` dependency)
- Modify: `packages/vulse/src/integration/inject-routes.ts`

- [ ] **Step 1: Add morphdom**

Run: `pnpm --filter vulse add morphdom`

- [ ] **Step 2: Write bridge source**

`packages/vulse/src/client/live-preview-bridge.ts`:

```ts
import morphdom from 'morphdom'

const ROOT = document.documentElement.dataset.vulsePreviewRoot ?? 'main'

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return
  if (event.data?.name !== 'vulse.preview.updated') return

  const res = await fetch(window.location.href, {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'text/html' },
  })
  if (!res.ok) return
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const from = doc.querySelector(ROOT)
  const to = document.querySelector(ROOT)
  if (from && to) morphdom(to, from, { childrenOnly: true })
})
```

- [ ] **Step 3: Serve bundled bridge**

`preview-bridge.ts` reads pre-bundled JS (build script in `package.json` `"build:bridge": "esbuild src/client/live-preview-bridge.ts --bundle --format=esm --outfile=dist/live-preview-bridge.js"`).

Alternatively inline esbuild at build time. Endpoint:

```ts
import bridgeJs from '../../dist/live-preview-bridge.js?raw'

export function previewBridgeRoute() {
  return async () => new Response(bridgeJs, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
```

Add build step to `package.json` `"build"` script before tsc.

- [ ] **Step 4: Inject route**

```ts
{ pattern: '/api/vulse/preview/bridge.js', file: 'api-vulse-preview-bridge.js' },
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vulse): live preview bridge script with morphdom"
```

---

### Task 6: LivePreviewPanel + EntryForm wiring

**Files:**
- Create: `packages/vulse/src/admin/components/LivePreviewPanel.vue`
- Modify: `packages/vulse/src/admin/components/EntryForm.vue`
- Modify: `packages/vulse/src/admin/pages/collections/[name]/[id].astro`

- [ ] **Step 1: EntryForm emit preview-change**

In `onFieldUpdate` and slug `watch`:

```ts
const emit = defineEmits<{ previewChange: [{ content: Record<string, unknown>; slug: string }] }>()

function emitPreview() {
  emit('previewChange', { content: { ...content.value }, slug: slug.value })
}

function onFieldUpdate(path: string, value: unknown) {
  // ...existing...
  emitPreview()
}
watch(slug, emitPreview)
```

- [ ] **Step 2: Implement LivePreviewPanel.vue**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { adminApi } from '../client/api.js'

const props = defineProps<{
  collection: string
  entryId?: string
  previewPath: string
  slug: string
  content: Record<string, unknown>
  enabled?: boolean
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const sessionId = ref<string | null>(null)
const iframeSrc = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function buildPath(slug: string) {
  return props.previewPath.replace('{slug}', encodeURIComponent(slug))
}

async function createSession() {
  const res = await adminApi.post<{ id: string; previewUrl: string }>('/api/vulse/preview/sessions', {
    collection: props.collection,
    entryId: props.entryId ?? null,
    slug: props.slug,
    content: props.content,
  })
  sessionId.value = res.id
  iframeSrc.value = res.previewUrl
}

async function pushUpdate(content: Record<string, unknown>, slug: string) {
  if (!sessionId.value) return
  await adminApi.put(`/api/vulse/preview/sessions/${sessionId.value}`, { content, slug })
  const pathChanged = buildPath(slug) !== buildPath(props.slug)
  if (pathChanged) {
    iframeSrc.value = `${buildPath(slug)}?vulse_live_preview=${sessionId.value}`
  }
  iframeRef.value?.contentWindow?.postMessage(
    { name: 'vulse.preview.updated', token: sessionId.value },
    window.location.origin,
  )
}

function scheduleUpdate(content: Record<string, unknown>, slug: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => pushUpdate(content, slug), 100)
}

onMounted(async () => {
  if (props.enabled === false) return
  await createSession()
})

onUnmounted(async () => {
  if (sessionId.value) {
    await adminApi.delete(`/api/vulse/preview/sessions/${sessionId.value}`).catch(() => {})
  }
})

watch(() => [props.content, props.slug], ([c, s]) => {
  scheduleUpdate(c as Record<string, unknown>, s as string)
}, { deep: true })

defineExpose({ scheduleUpdate })
</script>

<template>
  <div v-if="enabled !== false" class="flex h-full min-h-[480px] flex-col rounded border border-zinc-200">
    <div class="flex items-center justify-between border-b border-zinc-200 px-3 py-2 text-sm text-zinc-600">
      <span>Live preview</span>
      <a :href="iframeSrc" target="_blank" rel="noopener" class="underline">Open in tab</a>
    </div>
    <iframe ref="iframeRef" :src="iframeSrc" class="w-full flex-1 bg-white" title="Live preview" />
  </div>
</template>
```

- [ ] **Step 3: Split layout in entry edit page**

Wrap form + panel in grid; pass content from a small coordinator or bind EntryForm preview-change to panel ref.

Use pattern:

```astro
<div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
  <EntryForm client:load ... />
  <LivePreviewPanel client:load collection={bp.name} entryId={...} previewPath={previewTemplate} slug={row.slug} content={initial} enabled={bp.preview?.live !== false} />
</div>
```

Because `content` is reactive inside EntryForm, use a wrapper Vue component `EntryEditorWithPreview.vue` that holds shared state — cleaner than prop-drilling static `initial`.

Create `EntryEditorWithPreview.vue` combining EntryForm + LivePreviewPanel with shared content ref.

- [ ] **Step 4: Manual test in playground**

Run dev server, edit a page entry, confirm iframe updates within ~200 ms of typing.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vulse): admin live preview split panel"
```

---

### Task 7: Blueprint PreviewConfig + scaffolds + playground

**Files:**
- Modify: `packages/vulse/src/core/blueprints/types.ts`
- Modify: `packages/vulse/src/scaffold/collection.ts`
- Modify: `playground/vulse-play/src/pages/[slug].astro`
- Modify: `packages/vulse/README.MD`

- [ ] **Step 1: Extend PreviewConfig**

```ts
export interface PreviewConfig {
  path: string
  rootSelector?: string
  live?: boolean
}
```

- [ ] **Step 2: Update scaffold `generateShowPage`**

Replace manual preview check with:

```ts
import { resolvePreviewContent } from 'vulse/server'

const content = resolvePreviewContent(entry, Astro.locals) as Record<string, unknown>
```

Add to layout root if `rootSelector` set — middleware should set `data-vulse-preview-root` on `<html>` from blueprint when live preview active (optional enhancement in Task 4).

- [ ] **Step 3: Update playground `[slug].astro`**

Same `resolvePreviewContent` migration.

- [ ] **Step 4: README section**

Document live preview vs preview cookie, SSR requirement, `preview.rootSelector`, `preview.live: false`.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs(vulse): live preview helper and README"
```

---

### Task 8: Cron purge + migrate test

**Files:**
- Modify: `packages/vulse/src/server/cron.ts`
- Modify: `packages/vulse/tests/integration/migrate.test.ts`

- [ ] **Step 1: Add purge to cron**

```ts
import { PreviewSessionsRepo } from '../core/repos/preview-sessions.js'

const previewResult = await new PreviewSessionsRepo(db).purgeExpired(new Date())
console.log(`[vulse-cron] purged ${previewResult} preview session(s)`)
```

- [ ] **Step 2: Assert migration 0006 in migrate.test.ts**

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter vulse test`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(vulse): cron purge for expired preview sessions"
```

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| §3.1 Migration | Task 1 |
| §4 API | Task 3 |
| §5 Middleware + resolvePreviewContent | Tasks 2, 4 |
| §5.4 Bridge | Task 5 |
| §6 Admin UI | Task 6 |
| §7 Blueprint config | Task 7 |
| §9 Cron | Task 8 |
| §11 Docs/scaffold | Task 7 |

---

## Execution notes

- **Auth in iframe:** Same-origin iframe sends Better Auth session cookie; `ownerOk` path must call `getSession` on public page requests (Task 4).
- **EntryEditorWithPreview.vue:** Prefer one wrapper component over prop-drilling static initial content into `LivePreviewPanel`.
- **Bridge build:** Add esbuild devDependency; wire `build:bridge` into package `build` script.
- **HTML injection:** Only transform responses where `content-type` includes `text/html`; skip API routes and assets.
