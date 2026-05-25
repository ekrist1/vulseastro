# AGENTS.md — Vulse project context

This is an **Astro + Vulse** headless CMS project. Vulse stores content in Cloudflare D1; Astro pages read it via the Content Layer loader or runtime SDK.

Schema snapshot generated at 2026-05-25T12:14:28.033Z. Regenerate after schema changes:

```bash
npx vulse schema:export
```

Full schema reference: [`docs/vulse-schema.md`](docs/vulse-schema.md) (machine-readable: [`docs/vulse-schema.json`](docs/vulse-schema.json)).

## Collections

| Handle | Label | Title field | Preview path |
|--------|-------|-------------|--------------|
| `page` | Page | `title` | `/{slug}` |
| `post` | Blog post | `title` | `/post/{slug}` |
| `recipe` | Recipe | `title` | `/recipes/{slug}` |

## Rules for generating frontend pages

1. Use each collection's **preview path** as the route template (`{slug}` → `Astro.params.slug`).
2. Use **`admin.titleField`** for page headings and list cards.
3. Render **`blocks`** fields with `BlockRenderer` from `@vulsecms/core/client/BlockRenderer.astro`.
4. Use **`vulseLoader()`** + `getCollection()` for static archive pages; use the **runtime SDK** for SSR, filters, and auth-gated content.
5. Respect field types: `asset` fields are media IDs (resolve via SDK/media API); `entry`/`entries`/`relationship`/`link` fields reference other collections.
6. Check [`docs/vulse-schema.md`](docs/vulse-schema.md) for full field lists, sets, globals, and relationship edges before scaffolding new pages.
