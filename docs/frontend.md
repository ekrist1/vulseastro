# Frontend

This page covers wiring Vulse into your Astro project: pulling content into pages, rendering blocks, gating member-only routes, and exposing auth forms.

## Two ways to read content

Vulse offers **two complementary delivery paths**. Pick per page based on whether the page is statically generated or rendered on each request.

| Path | When to use | Mechanism |
|------|-------------|-----------|
| **Content Layer loader** | SSG / static builds, archive pages, full content rebuilds on publish | Astro's `defineCollection({ loader: vulseLoader(...) })` |
| **Runtime SDK** | SSR pages, filtered or paginated listings, members-only content, live preview | `rt.sdk.collections.find()` / `findBySlug()` / `rt.sdk.query()` |

You can use both in the same project — typically loader-only for archives that should pre-render, and the SDK for member-only pages and dynamic filtering.

The build-time loader syncs the full published set for static generation. `rt.sdk.collections.find()` is a simple filtered SSR read (author, date range, pagination). `rt.sdk.query()` is the full query builder for JSON-field filters, tree scoping, relationship resolution, counting, and pagination.

## Content Layer loader (SSG)

Wire the loader in `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content'
import { vulseLoader } from '@ekrist1/vulse/loader'

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

Then use Astro's content API in pages:

```astro
---
import { getCollection } from 'astro:content'
import BlockRenderer from '@ekrist1/vulse/client/BlockRenderer.astro'

const posts = await getCollection('post')
const post = posts.find((p) => p.data.slug === Astro.params.slug)
if (!post) return Astro.redirect('/404')
---
<h1>{post.data.title}</h1>
<BlockRenderer blocks={post.data.body ?? []} />
```

The loader reads **published** entries from D1 at sync/build time. In dev, D1 is resolved via wrangler's platform proxy — no extra setup.

For filtering, pagination, or author archives, prefer the runtime SDK below. The loader intentionally syncs the full published set so static generation is straightforward.

## Runtime SDK (SSR)

Use the SDK from a server-rendered page:

```astro
---
import {
  getRuntimeEnv,
  getRuntime,
  createDb,
  registryForRequest,
} from '@ekrist1/vulse/server'

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

// Single entry by slug
const post = await rt.sdk.collections.findBySlug('post', Astro.params.slug!, {
  audience: session?.user ?? null,
})

// Filtered / paginated listing
const archive = await rt.sdk.collections.find('post', {
  audience: session?.user ?? null,
  orderBy: 'publishedAt',
  order: 'desc',
  limit: 20,
  offset: 0,
  createdBy: 'author-id',        // optional
  publishedAfter: '2026-01-01',  // optional ISO date
})

// Full-text search
const hits = await rt.sdk.search.query('astro', { collections: ['post'], limit: 10 })

// Media URL
const heroUrl = rt.sdk.media.url(mediaId, 'hero')
---
```

The `audience` option is what activates per-entry access rules — pass the current `session.user` (or `null` for anonymous traffic). The SDK filters out entries the audience can't read.

## Query builder

For request-time filtering beyond `find()`, use the fluent query builder. It runs
as SQL against D1 and supports JSON-field filters, boolean groups, tree scoping,
relationship resolution, counting, and pagination.

```ts
const archive = await rt.sdk.query('post')
  .where('content.featured', '=', true)
  .andWhere((q) => q
    .where('content.views', '>=', 100)
    .orWhere('createdBy', '=', authorId))
  .descendantsOf(sectionId, { depth: 2 })
  .include('author')
  .forAudience(session?.user ?? null)
  .orderBy('publishedAt', 'desc')
  .paginate({ page: 1, perPage: 20 })

// archive.rows[0].relations.author -> resolved author entry (or null)
// archive.total, archive.pageCount
```

Results default to `status = 'published'` unless you add a `status` condition.
The default locale is the site default unless you call `.locale('en')`.

### Where clauses

Two-argument shorthand for equality:

```ts
rt.sdk.query('post').where('status', 'published')           // eq
rt.sdk.query('post').where('content.featured', '=', true)   // explicit op
```

### Operators

| Operator | Aliases | Meaning |
|----------|---------|---------|
| `eq` | `=` | Equal |
| `ne` | `!=`, `<>` | Not equal |
| `gt` | `>` | Greater than |
| `gte` | `>=` | Greater than or equal |
| `lt` | `<` | Less than |
| `lte` | `<=` | Less than or equal |
| `in` | | Value in array |
| `notIn` | `not in` | Value not in array |
| `like` | | Substring match (`%value%`) |
| `startsWith` | | Prefix match |
| `endsWith` | | Suffix match |
| `between` | | Range — value is `[lo, hi]` |
| `isNull` | | Field is null |
| `notNull` | | Field is not null |
| `contains` | | Array membership on a `content.*` array field |

### JSON content filtering

Filter on nested JSON fields with a `content.` prefix:

```ts
rt.sdk.query('post').where('content.featured', '=', true).all()
rt.sdk.query('post').where('content.seo.title', 'like', 'Guide').all()
```

Booleans work directly — they are normalized to `1`/`0` in SQL.

### Boolean groups

Top-level conditions are ANDed. Use `.orWhere()` to flip the current group to OR,
or `.andWhere(q => ...)` / `.orWhere(q => ...)` to nest a group:

```ts
// featured = true AND (views >= 100 OR createdBy = authorId)
await rt.sdk.query('post')
  .where('content.featured', '=', true)
  .andWhere((q) => q
    .where('content.views', '>=', 100)
    .orWhere('createdBy', '=', authorId))
  .all()
```

### Conditional filters

Apply a clause only when a value is present:

```ts
const tag = Astro.url.searchParams.get('tag')
await rt.sdk.query('post')
  .when(tag, (q) => q.where('content.tag', '=', tag))
  .all()
```

### Tree descendants

Scope results to a subtree of a tree collection:

```ts
// All descendants (excluding the parent)
rt.sdk.query('docs').descendantsOf(parentId).all()

// Direct children only
rt.sdk.query('docs').descendantsOf(parentId, { depth: 1 }).all()

// Include the parent row
rt.sdk.query('docs').descendantsOf(parentId, { includeSelf: true }).all()
```

Combine with `where` and `orderBy` as needed.

### Relationship includes

Resolve relationship fields into `row.relations`:

```ts
const posts = await rt.sdk.query('post')
  .include('author')                    // single → EntryRow | null
  .include('tags', { as: 'tagEntries' }) // multiple → EntryRow[]
  .all()

posts[0].relations.author   // resolved author entry
posts[0].relations.tagEntries // resolved tag entries (ordered)
```

Supported field kinds: `relationship` (`ref`), `entry`, and `entries`.

### Access gating

`.forAudience(user | null)` layers blueprint `read` rules on results after the SQL
fetch. Without it, queries are pure SQL — useful for trusted/public listings.

**Caveat:** `count()` and `limit`/`offset` reflect pre-gate totals, because
arbitrary read-rule functions cannot be expressed in SQL. For exact gated counts,
filter on `status`/`createdBy` directly in SQL.

### Terminal methods

| Method | Returns |
|--------|---------|
| `.all()` | All matching `EntryRow[]` (with `relations` if `include` used) |
| `.first()` | First row or `null` (applies `limit 1`) |
| `.count()` | Total matches (ignores `limit`/`offset`) |
| `.exists()` | `boolean` |
| `.paginate({ page, perPage })` | `{ rows, total, page, perPage, pageCount }` |

### Worked example: author archive

```ts
const authorId = Astro.params.authorId!
const page = Number(Astro.url.searchParams.get('page') ?? 1)

const archive = await rt.sdk.query('post')
  .where('createdBy', '=', authorId)
  .where('content.featured', '=', true)
  .include('tags')
  .forAudience(session?.user ?? null)
  .orderBy('publishedAt', 'desc')
  .paginate({ page, perPage: 12 })

// archive.rows — gated, published posts with resolved tags
// archive.total — pre-gate count (see caveat above)
// archive.pageCount — Math.ceil(total / perPage)
```

## Blocks

ProseMirror JSON from the TipTap editor renders via `BlockRenderer`:

```astro
import BlockRenderer from '@ekrist1/vulse/client/BlockRenderer.astro'
<!-- or Vue: import BlockRenderer from '@ekrist1/vulse/client/BlockRenderer.vue' -->

<BlockRenderer
  blocks={entry.data.body ?? []}
  mediaUrl={(id, variant) => `/api/vulse/media/${id}/file`}
/>
```

Legacy flat block arrays (a single array of node objects) are also supported.

### Styling built-in blocks

Built-in block nodes render with stable `data-vulse-*` hooks you can target in CSS:

```css
[data-vulse-accordion] { border: 1px solid #e4e4e7; border-radius: 0.5rem; }
[data-vulse-accordion] summary { font-weight: 600; padding: 0.75rem 1rem; cursor: pointer; }
[data-vulse-callout][data-tone="warning"] { background: #fef3c7; padding: 1rem; }
.vulse-heading { margin-top: 2rem; }
```

The admin preview and the public Vue renderer share these class names and data attributes, so styles match in both places.

### Custom sets

Reusable sets defined under **Admin → Settings → Sets** appear in the editor as `vulse-set` nodes. To render them with your own components on the public site, use the **Vue** renderer:

```vue
<script setup lang="ts">
import BlockRenderer from '@ekrist1/vulse/client/BlockRenderer.vue'
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

Each set component receives a `data` prop with the field values matching the set's schema.

> The Astro `BlockRenderer.astro` renders built-in blocks server-side without hydration. Custom sets output a placeholder unless you use the Vue renderer (hydrated with `client:load`) or map sets to your own Astro components manually.

## Locales

If you've enabled more than one locale in **Settings → Site**, the runtime SDK and loader take a `locale` option:

```ts
// SSG: build one Astro collection per language
import { vulseLoader } from '@ekrist1/vulse/loader'

export const collections = {
  post_en: defineCollection({ loader: vulseLoader({ collection: 'post', locale: 'en' }) }),
  post_fr: defineCollection({ loader: vulseLoader({ collection: 'post', locale: 'fr' }) }),
}

// SSR: pick a locale per request
const post = await rt.sdk.collections.findBySlug('post', slug, {
  audience: session?.user ?? null,
  locale: Astro.params.locale ?? 'en',
})
```

A common routing pattern is `/[locale]/[collection]/[slug]`. Astro doesn't enforce that shape — define your own routes and forward `Astro.params.locale` into the SDK.

## Live preview

The entry editor has a split-panel live preview that posts unsaved edits to a short-lived preview session. To consume them in your Astro pages, use the `resolvePreviewContent()` helper — see [`live-preview.md`](live-preview.md) for the full story.

## End-user auth

Sign-up is **disabled by default**. To allow public registration, flip **Settings → Auth → Allow member sign-up** in the admin (or set `allowMemberSignUp = true` in `vulse_settings`).

### Headless components

| Component | Purpose |
|-----------|---------|
| `SignInForm.astro` | Slot-based sign-in form |
| `SignUpForm.astro` | Slot-based sign-up form |
| `SignOutButton.astro` | Sign-out button |
| `SessionGuard.astro` | Server-side role gate |
| `FormRenderer.astro` | Embed a Vulse form (see [`forms.md`](forms.md)) |

Vulse ships these **headless** — you provide the markup and styling.

### Sign-in / sign-up

```astro
---
import SignInForm from '@ekrist1/vulse/client/components/SignInForm.astro'
import SignUpForm from '@ekrist1/vulse/client/components/SignUpForm.astro'
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

Hide the sign-up block when registration is off, or rely on the API returning 403. Forms dispatch custom events on the form element you can listen to:

| Event | When |
|-------|------|
| `vulse:sign-in:success` | Sign-in succeeded; the redirect is about to fire |
| `vulse:sign-in:error` | Sign-in failed; `event.detail` has the error |
| `vulse:sign-up:success` | Sign-up succeeded |
| `vulse:sign-up:error` | Sign-up failed (e.g. domain not allowlisted) |

### Members-only pages

```astro
---
import SessionGuard from '@ekrist1/vulse/client/components/SessionGuard.astro'
---
<SessionGuard requireRole="member" redirectTo="/sign-in">
  <h1>Members only</h1>
</SessionGuard>
```

`requireRole` accepts `'member'`, `'editor'`, or `'admin'`. Anonymous visitors are redirected; signed-in users without the required role get a 403.

### Browser auth SDK

```ts
import { auth as vulseAuth } from '@ekrist1/vulse/client/auth'

await vulseAuth.signIn({ email, password })
await vulseAuth.signUp({ email, password, name })
await vulseAuth.signOut()
const session = await vulseAuth.session()
```

These are thin wrappers over `/api/auth/*` (Better Auth) that handle credentials and CSRF for you.

## Globals

Globals are site-wide content. Fetch them at build time or per request:

```astro
---
const res = await fetch(new URL('/api/vulse/public/globals', Astro.url))
const { data: globals } = await res.json() as {
  ok: true
  data: Record<string, Record<string, unknown>>
}
---
<footer>
  <p>{globals.footer?.copyright as string}</p>
  <p>{globals.site?.tagline as string}</p>
</footer>
```

Or a single set:

```astro
---
const res = await fetch(new URL('/api/vulse/public/globals/site', Astro.url))
const { data: site } = await res.json()
---
<title>{site.siteName ?? 'My site'}</title>
```

For static builds, prefer fetching in `getStaticPaths` or in your layout's frontmatter so values are baked into HTML. On SSR, the same URLs resolve on your worker origin.

There is no Astro Content Layer loader for globals in v1 — `fetch` is the supported interface.

## Generated types

On dev/build, Vulse writes `.vulse/types.d.ts` from your blueprint files. Make sure it's in `tsconfig.json`:

```json
{
  "include": [".astro/types.d.ts", ".vulse/types.d.ts", "**/*"]
}
```

The integration regenerates this file on `astro:config:setup`, so restarting `pnpm dev` after blueprint changes is enough.

## Cheat sheet

| I want to… | Use |
|-----------|-----|
| List all published posts at build time | `getCollection('post')` via `vulseLoader` |
| List posts filtered by author at request time | `rt.sdk.collections.find('post', { createdBy, audience })` |
| Filter posts by a JSON field at request time | `rt.sdk.query('post').where('content.featured','=',true).all()` |
| Get a whole subtree of a tree collection | `rt.sdk.query('docs').descendantsOf(parentId).all()` |
| Resolve a relationship field | `rt.sdk.query('post').include('author').all()` |
| Count / paginate matching entries | `rt.sdk.query('post').where(...).count()` / `.paginate({ page, perPage })` |
| Get one entry by slug, respecting drafts/preview | `rt.sdk.collections.findBySlug(...)` + `resolvePreviewContent(...)` |
| Search across collections | `rt.sdk.search.query('term', { collections, limit, locale })` |
| Get a signed media URL | `rt.sdk.media.url(mediaId, 'variant')` |
| Read site-wide globals | `fetch('/api/vulse/public/globals')` |
| Block-render an entry body | `<BlockRenderer blocks={entry.data.body} />` |
| Gate a page to members | `<SessionGuard requireRole="member">` |
