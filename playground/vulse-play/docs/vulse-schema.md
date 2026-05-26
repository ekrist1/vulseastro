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

### Runtime SDK (default)

```astro
---
import { getRuntimeEnv, getRuntime, createDb, registryForRequest } from '@vulsecms/core/server'

export const prerender = false

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

const entry = await rt.sdk.collections.findBySlug('post', Astro.params.slug!, {
  audience: session?.user ?? null,
})

const archive = await rt.sdk.collections.find('post', {
  audience: session?.user ?? null,
})
---
```

Use the SDK for collection index/detail pages, filters, member-only content, and live preview. Admin publishes appear on the next request.

### Content Layer loader (optional SSG)

Only when you want build-time `getCollection()` and accept redeploying after publish. Run `npx vulse collection:scaffold <handle> --static` or wire `vulseLoader()` in `src/content.config.ts` manually. See `docs/frontend.md`.

### Rendering blocks

Rich text / blocks fields render with `BlockRenderer`:

```astro
---
import BlockRenderer from '@vulsecms/core/client/BlockRenderer.astro'
---
<BlockRenderer blocks={entry.content.body ?? []} />
```

Use `preview.path` from each collection when generating route files. Replace `{slug}` with `Astro.params.slug`.
