# Vulse

**Vulse** is an Astro-native, Vue Based, Cloudflare-hosted headless CMS. One deploy serves your public site, the admin UI (`/admin`), and the REST API (`/api/vulse/*`). Content lives in D1, assets in R2, search uses SQLite FTS5, and delivery uses Astro's Content Layer (build/sync) plus a runtime SDK (SSR / members-only content).

## Highlights

- **Cloudflare-native** — D1, R2, Queues, Cron, Pages or Workers. Single deploy.
- **Astro-first** — installs as an Astro integration; uses the Content Layer for SSG and a typed SDK for SSR.
- **Schema editor** — define collections in code or at runtime in the admin UI (with safe field renames).
- **Rich blocks** — TipTap/ProseMirror editor with reusable Sets and Replicators.
- **Drafts + Live preview** — split-panel live editor preview and signed saved-draft preview links.
- **i18n** — each entry can carry multiple locale translations with per-locale slugs and statuses.
- **Forms** — first-party form builder with submissions, file uploads, async hooks via Queues.
- **Auth** — Better Auth under the hood; role-based access (`admin` / `editor` / `member`).
- **Globals** — site-wide content sets exposed via a public read API.

## Install

> **Alpha:** install the `alpha` dist-tag until 1.0:
>
> `pnpm astro add @ekrist1/vulse@alpha`

```bash
pnpm astro add @ekrist1/vulse@alpha
pnpm astro add cloudflare
wrangler d1 create vulse-db
wrangler r2 bucket create vulse-media
npx vulse migrate
npx vulse seed:admin --email you@example.com
pnpm dev
```

Sign in at `http://localhost:4321/admin/login`.

The full setup (Cloudflare resources, secrets, first admin) is documented in [`docs/installation.md`](https://github.com/ekrist1/vulseastro/blob/main/docs/installation.md).

## Documentation

Vulse's documentation lives on GitHub:

| Page | Purpose |
|------|---------|
| [Installation](https://github.com/ekrist1/vulseastro/blob/main/docs/installation.md) | Prerequisites, install, Cloudflare resources, first admin |
| [Upgrading](https://github.com/ekrist1/vulseastro/blob/main/docs/upgrading.md) | Updates and migrations |
| [Configuration](https://github.com/ekrist1/vulseastro/blob/main/docs/configuration.md) | `wrangler.toml` bindings, env vars, runtime settings |
| [Control panel](https://github.com/ekrist1/vulseastro/blob/main/docs/control-panel.md) | Admin UI walkthrough |
| [Content modeling](https://github.com/ekrist1/vulseastro/blob/main/docs/content-modeling.md) | Blueprints, sets, replicators, globals, locales |
| [Frontend](https://github.com/ekrist1/vulseastro/blob/main/docs/frontend.md) | Wiring Vulse into Astro |
| [Live preview](https://github.com/ekrist1/vulseastro/blob/main/docs/live-preview.md) | Live preview and saved-draft preview |
| [Forms](https://github.com/ekrist1/vulseastro/blob/main/docs/forms.md) | Form builder, spam, queues, hooks |
| [Plugins](https://github.com/ekrist1/vulseastro/blob/main/docs/plugins.md) | Native Vulse plugins for forms, auth, CRM, and email workflows |
| [API reference](https://github.com/ekrist1/vulseastro/blob/main/docs/api-reference.md) | REST endpoints |
| [CLI reference](https://github.com/ekrist1/vulseastro/blob/main/docs/cli.md) | `vulse migrate`, `seed:admin`, `collection:scaffold` |
| [Deployment](https://github.com/ekrist1/vulseastro/blob/main/docs/deployment.md) | Cloudflare deploy + production checklist |
| [Directory structure](https://github.com/ekrist1/vulseastro/blob/main/docs/directory-structure.md) | What files and folders mean |
| [Troubleshooting](https://github.com/ekrist1/vulseastro/blob/main/docs/troubleshooting.md) | FAQ and common errors |

## Quick example

```ts
// src/vulse/collections/post.ts
import { defineCollection, z, blocks, media } from '@ekrist1/vulse'

export default defineCollection({
  name: 'post',
  label: 'Blog post',
  schema: z.object({
    title: z.string().min(1),
    slug: z.string(),
    cover: media().optional(),
    body: blocks(),
  }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
  access: {
    read: ({ entry, user }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
  },
})
```

```astro
---
// src/pages/blog/[slug].astro
import { getCollection } from 'astro:content'
import BlockRenderer from '@ekrist1/vulse/client/BlockRenderer.astro'

const posts = await getCollection('post')
const post = posts.find((p) => p.data.slug === Astro.params.slug)
if (!post) return Astro.redirect('/404')
---
<h1>{post.data.title}</h1>
<BlockRenderer blocks={post.data.body ?? []} />
```

## Requirements

- Node.js 22+
- pnpm 9+
- Astro 6 with `@astrojs/cloudflare` in server-output mode
- Cloudflare account (free tier is enough to develop)

## License

MIT — see [LICENSE](https://github.com/ekrist1/vulseastro/blob/main/LICENSE).
