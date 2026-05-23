# Plan 6 — Content Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public Astro pages can consume Vulse content via the Content Layer loader (build-time) and the runtime SDK (SSR). FTS5-backed search is exposed via the SDK. Preview cookies let editors view drafts on the public site. Generated `vulse.d.ts` types `getCollection()` returns against blueprints.

**Architecture:** `vulseLoader()` plugs into Astro's Content Layer; it reads D1 at sync/build time. The SDK (`vulse`) is a thin object exposing collection accessors, media URL builder, auth helpers, and search. FTS5 virtual table is created in a migration and kept in sync via SQLite triggers. Preview middleware reads a signed cookie and toggles draft visibility.

**Tech Stack:** Astro 6 Content Layer API, Drizzle (raw SQL for FTS5), `jose` for signed cookies.

**Spec reference:** §3.1-3.5 (loader/SDK/search/preview), §2.6 (locale column, default only in v1).

**Prerequisites:** Plans 1-5 complete.

---

### Task 1: vulseLoader

**Files:**
- Create: `packages/vulse/src/server/loader.ts`
- Modify: `packages/vulse/src/loader.ts` (public re-export)
- Create: `packages/vulse/tests/integration/loader.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { vulseLoader } from '../../src/server/loader'

describe('vulseLoader', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('yields only published entries by default', async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)
    await repo.create({ collection: 'post', slug: 'draft', content: { title: 'D', slug: 'draft', body: [] }, createdBy: 'u' })
    await repo.create({ collection: 'post', slug: 'live', content: { title: 'L', slug: 'live', body: [] }, createdBy: 'u', status: 'published' })

    const items = await runLoader('post', { dbBinding: env.DB })
    expect(items.map((i) => i.slug)).toEqual(['live'])
  })

  it('includes drafts when previewToken matches', async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)
    await repo.create({ collection: 'post', slug: 'draft', content: { title: 'D', slug: 'draft', body: [] }, createdBy: 'u' })
    const items = await runLoader('post', { dbBinding: env.DB, includeDrafts: true })
    expect(items.length).toBe(1)
  })
})

// Test helper: invokes the loader's load() function directly with a mock context.
async function runLoader(collection: string, opts: { dbBinding: D1Database; includeDrafts?: boolean }) {
  const loader = vulseLoader({ collection })
  const collected: any[] = []
  const ctx = {
    store: { set: (entry: any) => { collected.push(entry) }, clear: () => { collected.length = 0 } },
    meta: { get: () => undefined, set: () => {} },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    parseData: async (e: any) => e.data,
    generateDigest: (s: string) => s,
    config: {} as any,
    entryTypes: {} as any,
    refreshContextData: undefined,
    // The real loader gets the binding via globalThis in tests:
    _vulseTestBinding: opts.dbBinding,
    _vulseIncludeDrafts: opts.includeDrafts ?? false,
  }
  await loader.load(ctx as any)
  return collected.map((e) => ({ id: e.id, slug: e.data.slug, status: e.data.status }))
}
```

- [ ] **Step 2: Implement**

```ts
import type { Loader } from 'astro/loaders'
import { createDb } from '../core/db.js'
import { EntriesRepo } from '../core/repos/entries.js'

export interface VulseLoaderOptions {
  collection: string
  locale?: string
}

declare global { var __VULSE_TEST_DB__: D1Database | undefined }

function resolveBinding(ctx: any): D1Database {
  if ((ctx as any)._vulseTestBinding) return (ctx as any)._vulseTestBinding
  if (globalThis.__VULSE_TEST_DB__) return globalThis.__VULSE_TEST_DB__
  // Astro Cloudflare integration injects `locals.runtime.env` during SSR.
  // For build-time loader: the user runs `astro build` with `wrangler` context (CI) or local miniflare (dev).
  // We expect `process.env.VULSE_BUILD_DB` to be set by the build script, OR the user wires it via Vite plugin.
  // For v1 we require the user to opt into one path: see docs.
  throw new Error('vulseLoader: no D1 binding available. See https://vulse.dev/docs/loader-binding')
}

export function vulseLoader(opts: VulseLoaderOptions): Loader {
  return {
    name: `vulse-loader-${opts.collection}`,
    load: async (ctx) => {
      const includeDrafts = (ctx as any)._vulseIncludeDrafts ?? false
      const db = createDb(resolveBinding(ctx))
      const repo = new EntriesRepo(db)
      const rows = await repo.list({
        collection: opts.collection,
        ...(includeDrafts ? {} : { status: 'published' }),
      })

      ctx.store.clear()
      for (const r of rows) {
        if (opts.locale && r.locale !== opts.locale) continue
        await ctx.store.set({
          id: r.id,
          digest: `v${r.version}`,
          data: {
            ...((r.content as Record<string, unknown>) ?? {}),
            id: r.id, slug: r.slug, status: r.status,
            publishedAt: r.publishedAt?.toISOString() ?? null,
            updatedAt: r.updatedAt.toISOString(),
          },
        })
      }
    },
  }
}
```

`src/loader.ts`:
```ts
export { vulseLoader } from './server/loader.js'
export type { VulseLoaderOptions } from './server/loader.js'
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter vulse test:integration
git add packages/vulse/src/server/loader.ts packages/vulse/src/loader.ts packages/vulse/tests/integration/loader.test.ts
git commit -m "feat(vulse): astro content layer loader"
```

---

### Task 2: Runtime SDK — collections

**Files:**
- Create: `packages/vulse/src/server/sdk/index.ts`
- Create: `packages/vulse/src/server/sdk/collections.ts`
- Create: `packages/vulse/src/server/sdk/media.ts`
- Modify: `packages/vulse/src/server.ts` (public export)

- [ ] **Step 1: Implement collections SDK**

```ts
import type { VulseDb } from '../../core/db.js'
import { EntriesRepo } from '../../core/repos/entries.js'
import { evaluate } from '../../core/access.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import type { AuthContext } from '../../core/blueprints/types.js'

export interface CollectionSdkOptions { audience?: AuthContext['user'] | null }

export function collectionsSdk(db: VulseDb, reg: BlueprintRegistry) {
  const entries = new EntriesRepo(db)
  async function gatedRows(name: string, audience: AuthContext['user'] | null, status?: 'draft' | 'published') {
    const bp = reg.get(name)
    if (!bp) throw new Error(`Unknown collection: ${name}`)
    const rows = await entries.list({ collection: name, ...(status ? { status } : {}) })
    const out = []
    for (const r of rows) {
      const allowed = await evaluate(bp, 'read', {
        user: audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      if (allowed) out.push(r)
    }
    return out
  }
  return {
    find: async (collection: string, opts: CollectionSdkOptions = {}) =>
      gatedRows(collection, opts.audience ?? null, 'published'),
    findById: async (collection: string, id: string, opts: CollectionSdkOptions = {}) => {
      const bp = reg.get(collection); if (!bp) throw new Error(`Unknown collection: ${collection}`)
      const r = await entries.findById(id); if (!r) return null
      const allowed = await evaluate(bp, 'read', {
        user: opts.audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      return allowed ? r : null
    },
    findBySlug: async (collection: string, slug: string, opts: CollectionSdkOptions = {}) => {
      const bp = reg.get(collection); if (!bp) throw new Error(`Unknown collection: ${collection}`)
      const r = await entries.findBySlug(collection, slug); if (!r) return null
      const allowed = await evaluate(bp, 'read', {
        user: opts.audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      return allowed ? r : null
    },
  }
}
```

- [ ] **Step 2: Media SDK**

`src/server/sdk/media.ts`:

```ts
import type { VulseDb } from '../../core/db.js'
import { MediaRepo } from '../../core/repos/media.js'
import { buildDeliveryUrl, type CfImagesConfig, type Variant } from '../cf-images.js'

export function mediaSdk(db: VulseDb, cfg: CfImagesConfig) {
  const repo = new MediaRepo(db)
  return {
    url: (id: string, variant: Variant | string = 'card') => buildDeliveryUrl(cfg, id, variant),
    findById: (id: string) => repo.findById(id),
  }
}
```

- [ ] **Step 3: SDK aggregator**

`src/server/sdk/index.ts`:

```ts
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { collectionsSdk } from './collections.js'
import { mediaSdk } from './media.js'
import type { CfImagesConfig } from '../cf-images.js'

export function createSdk(db: VulseDb, auth: Auth, registry: BlueprintRegistry, cfImages: CfImagesConfig) {
  return {
    collections: collectionsSdk(db, registry),
    media: mediaSdk(db, cfImages),
    auth: {
      session: (request: Request) => auth.api.getSession({ headers: request.headers }),
    },
  }
}
export type VulseSdk = ReturnType<typeof createSdk>
```

`src/server.ts`:
```ts
export { createSdk } from './server/sdk/index.js'
export type { VulseSdk } from './server/sdk/index.js'
```

- [ ] **Step 4: Wire into runtime + a convenience accessor**

Modify `runtime.ts` to also expose `sdk` on the returned object.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/server/sdk packages/vulse/src/server.ts packages/vulse/src/server/runtime.ts
git commit -m "feat(vulse): runtime SDK (collections + media + auth session)"
```

---

### Task 3: FTS5 search

**Files:**
- Modify: `packages/vulse/src/core/schema.ts` (add FTS table — via raw SQL in a new migration)
- Create: `packages/vulse/migrations/0001_fts.sql`
- Create: `packages/vulse/src/server/sdk/search.ts`
- Create: `packages/vulse/src/server/routes/search.ts`
- Create: `packages/vulse/tests/integration/search.test.ts`

- [ ] **Step 1: Add migration with FTS5 setup**

`migrations/0001_fts.sql`:

```sql
-- FTS5 virtual table over entries
CREATE VIRTUAL TABLE vulse_entries_fts USING fts5(
  entry_id UNINDEXED, collection UNINDEXED, slug, title, body,
  content='', contentless_delete=1
);

-- Triggers to keep it in sync
CREATE TRIGGER vulse_entries_fts_insert AFTER INSERT ON vulse_entries BEGIN
  INSERT INTO vulse_entries_fts(entry_id, collection, slug, title, body)
  VALUES (NEW.id, NEW.collection, NEW.slug, json_extract(NEW.content, '$.title'), json_extract(NEW.content, '$.body'));
END;

CREATE TRIGGER vulse_entries_fts_update AFTER UPDATE OF content, slug ON vulse_entries BEGIN
  DELETE FROM vulse_entries_fts WHERE entry_id = OLD.id;
  INSERT INTO vulse_entries_fts(entry_id, collection, slug, title, body)
  VALUES (NEW.id, NEW.collection, NEW.slug, json_extract(NEW.content, '$.title'), json_extract(NEW.content, '$.body'));
END;

CREATE TRIGGER vulse_entries_fts_delete AFTER DELETE ON vulse_entries BEGIN
  DELETE FROM vulse_entries_fts WHERE entry_id = OLD.id;
END;
```

Update `migrations/meta/_journal.json` to register `0001_fts`.

- [ ] **Step 2: SDK + route**

`src/server/sdk/search.ts`:

```ts
import type { VulseDb } from '../../core/db.js'
import { sql } from 'drizzle-orm'

export interface SearchResult { entryId: string; collection: string; slug: string; title: string; snippet: string }

export function searchSdk(db: VulseDb) {
  return {
    query: async (query: string, opts: { collections?: string[]; limit?: number } = {}): Promise<SearchResult[]> => {
      const limit = opts.limit ?? 20
      const filterCollections = opts.collections && opts.collections.length > 0
      const safeQuery = query.replace(/"/g, '""').trim()
      if (!safeQuery) return []
      const rows = await db.all<{ entry_id: string; collection: string; slug: string; title: string; snippet: string }>(sql`
        SELECT entry_id, collection, slug, title,
               snippet(vulse_entries_fts, 4, '<mark>', '</mark>', '…', 8) AS snippet
        FROM vulse_entries_fts
        WHERE vulse_entries_fts MATCH ${`"${safeQuery}"*`}
        ${filterCollections ? sql`AND collection IN (${sql.join(opts.collections!.map((c) => sql`${c}`), sql`, `)})` : sql``}
        LIMIT ${limit}
      `)
      return rows.map((r) => ({
        entryId: r.entry_id, collection: r.collection, slug: r.slug, title: r.title ?? r.slug, snippet: r.snippet,
      }))
    },
  }
}
```

`src/server/routes/search.ts`:

```ts
import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { searchSdk } from '../sdk/search.js'

export function searchRoutes(db: VulseDb, auth: Auth) {
  const sdk = searchSdk(db)
  return {
    query: defineHandler(auth, {
      params: z.object({}),
      body: z.object({ q: z.string(), collections: z.array(z.string()).optional(), limit: z.number().optional() }),
    }, async ({ body }) => sdk.query(body.q, { collections: body.collections, limit: body.limit })),
  }
}
```

- [ ] **Step 3: Integration test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { searchSdk } from '../../src/server/sdk/search'

describe('search', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('finds entries by title', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    await entries.create({ collection: 'post', slug: 'a', content: { title: 'Astro is great', body: '' }, createdBy: 'u', status: 'published' })
    await entries.create({ collection: 'post', slug: 'b', content: { title: 'Cloudflare workers', body: '' }, createdBy: 'u', status: 'published' })

    const results = await searchSdk(db).query('astro')
    expect(results.length).toBe(1)
    expect(results[0].slug).toBe('a')
  })

  it('filters by collection', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    await entries.create({ collection: 'post', slug: 'x', content: { title: 'foo', body: '' }, createdBy: 'u', status: 'published' })
    await entries.create({ collection: 'page', slug: 'y', content: { title: 'foo', body: '' }, createdBy: 'u', status: 'published' })

    const onlyPosts = await searchSdk(db).query('foo', { collections: ['post'] })
    expect(onlyPosts.length).toBe(1)
    expect(onlyPosts[0].collection).toBe('post')
  })
})
```

- [ ] **Step 4: Add `sdk.search` to the SDK aggregator** and wire route.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/migrations/0001_fts.sql packages/vulse/src/server/sdk/search.ts packages/vulse/src/server/routes/search.ts packages/vulse/tests/integration/search.test.ts
git commit -m "feat(vulse): FTS5 search with title/body indexing"
```

---

### Task 4: Preview mode middleware + signed cookies

**Files:**
- Create: `packages/vulse/src/server/preview.ts`
- Create: `packages/vulse/src/server/routes/preview.ts`
- Modify: `packages/vulse/src/integration/middleware.ts` (toggle draft visibility)
- Create: `packages/vulse/tests/unit/preview.test.ts`

- [ ] **Step 1: Implement signed token**

```ts
import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'

export async function mintPreviewToken(secret: string, userId: string, ttlSeconds = 60 * 60): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return await new SignJWT({ sub: userId, kind: 'vulse-preview' })
    .setProtectedHeader({ alg: ALG })
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key)
}

export async function verifyPreviewToken(secret: string, token: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    return payload.kind === 'vulse-preview'
  } catch { return false }
}
```

Add `jose` dep: `pnpm --filter vulse add jose`

- [ ] **Step 2: Preview route**

`src/server/routes/preview.ts`:

```ts
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { mintPreviewToken } from '../preview.js'

export function previewRoutes(auth: Auth, secret: string) {
  return {
    start: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async ({ auth: a, url }) => {
      const token = await mintPreviewToken(secret, a.user!.id)
      const cookie = `vulse_preview=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
      const redirect = new URL(url.searchParams.get('to') ?? '/', url.origin)
      return new Response(null, { status: 302, headers: { location: redirect.toString(), 'set-cookie': cookie } })
    }),
    stop: defineHandler(auth, {}, async () => {
      return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': 'vulse_preview=; Path=/; Max-Age=0' } })
    }),
  }
}
```

> Note: `start` returns a raw 302 — the envelope wrapper is bypassed in that case. Update `handler.ts` to allow handlers to return a `Response` directly (skip wrapping when `result instanceof Response`).

Patch `handler.ts`:
```ts
const result = await fn({ ... })
if (result instanceof Response) return result
return ok(result)
```

- [ ] **Step 3: Middleware reads cookie and exposes to SDK**

In `integration/middleware.ts`, add public-site handling:

```ts
const previewToken = (ctx.request.headers.get('cookie') ?? '').match(/vulse_preview=([^;]+)/)?.[1]
if (previewToken && await verifyPreviewToken(env.VULSE_PREVIEW_SECRET, previewToken)) {
  (ctx.locals as any).vulsePreview = true
}
```

The SDK and loader read this flag via the request to include drafts.

- [ ] **Step 4: Test the token round-trip**

```ts
import { describe, it, expect } from 'vitest'
import { mintPreviewToken, verifyPreviewToken } from '../../src/server/preview'

describe('preview token', () => {
  it('round-trips', async () => {
    const t = await mintPreviewToken('a'.repeat(32), 'u1')
    expect(await verifyPreviewToken('a'.repeat(32), t)).toBe(true)
  })
  it('rejects wrong secret', async () => {
    const t = await mintPreviewToken('a'.repeat(32), 'u1')
    expect(await verifyPreviewToken('b'.repeat(32), t)).toBe(false)
  })
})
```

- [ ] **Step 5: Add "Preview" button to admin entry page**

In `pages/collections/[name]/[id].astro`, add:

```astro
<a href={`/api/vulse/preview/start?to=/${bp.name}/${entry.slug}`} class="rounded border px-3 py-1 text-sm">Preview</a>
```

- [ ] **Step 6: Commit**

```bash
git add packages/vulse/src/server/preview.ts packages/vulse/src/server/routes/preview.ts packages/vulse/src/integration/middleware.ts packages/vulse/src/server/handler.ts packages/vulse/tests/unit/preview.test.ts packages/vulse/package.json
git commit -m "feat(vulse): preview mode with signed cookies"
```

---

### Task 5: Type generation for blueprints

**Files:**
- Create: `packages/vulse/src/integration/type-gen.ts`
- Modify: `packages/vulse/src/integration/index.ts` (call type-gen during `astro:config:setup`)

- [ ] **Step 1: Implement**

```ts
import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function generateBlueprintTypes(projectRoot: string): Promise<void> {
  const collectionsDir = join(projectRoot, 'src/vulse/collections')
  let files: string[]
  try { files = (await readdir(collectionsDir)).filter((f) => f.endsWith('.ts')) }
  catch { files = [] }

  const names = files.map((f) => f.replace(/\.ts$/, ''))

  const out = `// Auto-generated by Vulse. Do not edit.
declare module 'vulse/server' {
  interface VulseCollections {
${names.map((n) => `    ${n}: any  // refined post-load`).join('\n')}
  }
}

declare module 'astro:content' {
  type VulseSlugs = ${names.length > 0 ? names.map((n) => `'${n}'`).join(' | ') : 'string'}
}
`
  await mkdir(join(projectRoot, '.vulse'), { recursive: true })
  await writeFile(join(projectRoot, '.vulse/types.d.ts'), out, 'utf8')
}
```

- [ ] **Step 2: Wire into integration**

```ts
'astro:config:setup': async ({ injectRoute, logger, addMiddleware, config, updateConfig }) => {
  await generateBlueprintTypes(config.root.pathname)
  updateConfig({ vite: { plugins: [...] } })
  // ...
}
```

- [ ] **Step 3: Update user-side tsconfig**

The install hook (Plan 1 Task 14) needs to ensure the user's `tsconfig.json` includes `.vulse/types.d.ts`:

```ts
const tsConfigPath = join(cwd, 'tsconfig.json')
if (await fileExists(tsConfigPath)) {
  const json = JSON.parse(await readFile(tsConfigPath, 'utf8'))
  json.include = [...new Set([...(json.include ?? []), '.vulse/types.d.ts'])]
  await writeFile(tsConfigPath, JSON.stringify(json, null, 2))
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/integration/type-gen.ts packages/vulse/src/integration/index.ts packages/vulse/src/integration/install-hook.ts
git commit -m "feat(vulse): generate .vulse/types.d.ts on dev/build"
```

---

### Task 6: Smoke-test in playground

- [ ] **Step 1: Render a page using getCollection**

`playground/vulse-play/src/pages/[slug].astro`:

```astro
---
import { getCollection } from 'astro:content'
import { BlockRenderer } from 'vulse/client'

export async function getStaticPaths() {
  const pages = await getCollection('page')
  return pages.map((p) => ({ params: { slug: p.data.slug }, props: { page: p } }))
}
const { page } = Astro.props
---
<html><body>
  <h1>{page.data.title}</h1>
  <BlockRenderer blocks={page.data.body ?? []} />
</body></html>
```

- [ ] **Step 2: Manual verification**

1. In admin: create a `page` entry with slug "about", add a heading and paragraph block, publish.
2. Run `pnpm --filter growing-gravity dev`.
3. Visit `http://localhost:4321/about` — expect to see the heading + paragraph rendered.
4. In admin: create a draft page, click "Preview" — expect to see the draft in the public site (preview cookie set).

- [ ] **Step 3: Commit**

```bash
git add playground/vulse-play/src/pages
git commit -m "chore(playground): public page rendering through loader + BlockRenderer"
```

---

## Self-review

- **Spec coverage:** §3.1 loader — Task 1; §3.2 SDK — Task 2; §3.4 search — Task 3; §3.5 preview — Task 4; type gen for §2.1 — Task 5.
- **Placeholders:** type-gen emits `any` for collection types in v1 — narrowing to the Zod-inferred shape needs the integration to import user blueprints, which we defer to v1.x to keep the build path simple. Documented inline.
- **Type consistency:** `VulseSdk`, `vulseLoader`, `BlockRenderer` exports stable.
- **What this plan does NOT do:** end-user sign-up/sign-in components (Plan 7); E2E test journey (Plan 8).
