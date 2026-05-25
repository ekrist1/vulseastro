# Vulse content schema

> Generated at 2026-05-25T12:14:28.033Z. Regenerate with `vulse schema:export`.

## Collections

### Page (`page`)

- **Title field:** `title`
- **List columns:** `title`, `slug`
- **Preview path:** `/{slug}`

| Field | Type | Required |
|-------|------|----------|
| `title` | text | required |
| `slug` | text | required |
| `body` | blocks | optional |

### Blog post (`post`)

Flags: drafts, seo

- **Title field:** `title`
- **List columns:** `title`, `slug`
- **Preview path:** `/post/{slug}`

| Field | Type | Required |
|-------|------|----------|
| `title` | text | required |
| `slug` | text | required |
| `body` | blocks | optional |
| `main_image` | asset | optional |
| `related_entries` | entries (post), max 5 | required |

### Recipe (`recipe`)

Flags: tree, drafts, seo

- **Title field:** `title`
- **List columns:** `title`, `slug`
- **Preview path:** `/recipes/{slug}`

| Field | Type | Required |
|-------|------|----------|
| `title` | text | required |
| `slug` | text | required |
| `body` | blocks | optional |

## Sets (block types)

_No sets defined._

## Globals

_No global sets defined._

## Relationships

- `post.related_entries` → entries in `post`

## Frontend cookbook

### Content Layer loader (SSG)

Wire collections in `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content'
import { vulseLoader } from '@vulsecms/core/loader'

export const collections = {
  post: defineCollection({
    loader: vulseLoader({ collection: 'post' }),
    schema: z.object({ title: z.string(), slug: z.string() }),
  }),
}
```

Use `getCollection()` in pages for static archive/detail routes.

### Runtime SDK (SSR)

```astro
---
import { getRuntimeEnv, getRuntime, createDb, registryForRequest } from '@vulsecms/core/server'

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const entry = await rt.sdk.collections.findBySlug('post', Astro.params.slug!)
---
```

Use the SDK for filtered listings, member-only content, and live preview.

### Rendering blocks

Rich text / blocks fields render with `BlockRenderer`:

```astro
---
import BlockRenderer from '@vulsecms/core/client/BlockRenderer.astro'
---
<BlockRenderer blocks={entry.content.body ?? []} />
```

Use `preview.path` from each collection when generating route files. Replace `{slug}` with `Astro.params.slug`.
