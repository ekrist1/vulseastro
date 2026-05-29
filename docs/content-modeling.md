# Content modeling

Vulse models content as **blueprints** (collections) containing **entries** (the rows). Within an entry, rich text is structured as **blocks**, and reusable building blocks are defined as **sets**. Site-wide values that aren't tied to a single page live in **globals**. Each entry can be authored in one or more **locales**.

This page walks through each concept and how to define it.

## Blueprints (collections)

A blueprint defines a collection of entries (think Post, Page, Product). It is a Zod schema for the entry content plus some metadata. Define one in `src/vulse/collections/<handle>.ts`:

```ts
// src/vulse/collections/post.ts
import { defineCollection, z, blocks, media } from '@vulsecms/core'

export default defineCollection({
  name: 'post',
  label: 'Blog post',
  schema: z.object({
    title: z.string().min(1),
    slug: z.string(),
    excerpt: z.string().optional(),
    cover: media().optional(),
    body: blocks(),
  }),
  admin: {
    titleField: 'title',
    listColumns: ['title', 'slug'],
  },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
  preview: {
    path: '/blog/{slug}',
  },
})
```

Reload `/admin` — the collection appears in the sidebar. You can also create collections at runtime under **Schema → New collection** (the admin UI persists them in the `vulse_collections` table; code-defined blueprints are merged in on boot).

### Top-level options

| Option | Type | Purpose |
|--------|------|---------|
| `name` | string | The handle. Lowercase letters, digits, `-`, `_`. **Locked after creation.** |
| `label` | string | Human-friendly name shown in the admin UI |
| `schema` | Zod object | The shape of the entry's content JSON |
| `admin` | object | `titleField`, `listColumns`, ... |
| `access` | object | Per-action access rules — see below |
| `preview` | object | `path`, `rootSelector`, `live` — see [`live-preview.md`](live-preview.md) |
| `singleton` | boolean | Only one entry allowed (e.g. a Home Page) |
| `tree` | boolean | Entries can be nested under each other (e.g. pages with parents) |
| `maxDepth` | number | Optional tree depth cap |
| `drafts` | boolean | When true, the editor keeps an unsaved-draft buffer separate from the published version |

A blueprint cannot be both `singleton` and `tree`.

### The schema

Use the re-exported `z` from Vulse:

```ts
import { z, blocks, media, ref } from '@vulsecms/core'
```

| Helper | Returns |
|--------|---------|
| `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, `z.enum([...])` | Standard Zod types |
| `z.string().describe('vulse:media')` or `media()` | A media field (renders as an asset picker) |
| `z.string().describe('vulse:ref:<collection>')` or `ref('<collection>')` | A reference field |
| `blocks()` | A rich-text body using TipTap/ProseMirror |
| `z.array(z.object({ ... }))` | A repeater field (rendered as an inline list of subforms) |

For example, `cover: media().optional()` is exactly equivalent to `cover: z.string().describe('vulse:media').optional()`. The reflection layer inspects `.describe()` tags to pick the right field widget.

### Admin options

```ts
admin: {
  titleField: 'title',        // Used to auto-generate slugs and render entry headings
  listColumns: ['title', 'slug', 'updatedAt'],
}
```

`listColumns` controls which fields appear in `/admin/collections/<handle>` list view.

### Access rules

Each action (`read`, `create`, `update`, `delete`) takes a function `(ctx) => boolean | Promise<boolean>`. The context is:

```ts
{
  user: { id, email, role } | null,
  entry?: { id, status, createdBy, content },
}
```

`entry` is present on `read`, `update`, and `delete` checks. It is absent on `create`. Common patterns:

```ts
access: {
  // Public can read published; signed-in users can also see drafts they wrote.
  read: ({ user, entry }) =>
    entry?.status === 'published'
    || (entry?.createdBy === user?.id),

  // Only staff can create / update / delete.
  create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
  update: ({ user, entry }) =>
    user?.role === 'admin' || (user?.role === 'editor' && entry?.createdBy === user?.id),
  delete: ({ user }) => user?.role === 'admin',
}
```

Access rules run both on the REST API and inside the SDK (`rt.sdk.collections.find`, `findBySlug`, …) so the same rules apply to admin and to your public site.

### Scaffold frontend pages

After defining a collection in code (or in **Admin → Schema**), use the CLI to generate matching Astro pages and a `content.config.ts` loader entry:

```bash
npx vulse collection:scaffold blog \
  --route '/blog/{slug}' \
  --index '/blog'
```

See [`cli.md#vulse-collectionscaffold`](cli.md#vulse-collectionscaffold) for all options.

## Blocks (rich-text body)

The `blocks()` helper marks a field as rich-text. The editor stores ProseMirror JSON — a tree of nodes (`paragraph`, `heading`, `bullet_list`, …).

To render that JSON in your Astro pages:

```astro
---
import BlockRenderer from '@vulsecms/core/client/BlockRenderer.astro'
---
<BlockRenderer
  blocks={entry.data.body ?? []}
  mediaUrl={(id) => `/api/vulse/public/media/${id}/file`}
/>
```

Use the **public** media route (`/api/vulse/public/media/:id/file`) on your site — the
`/api/vulse/media/:id/file` route is admin-only. For compressed/responsive delivery, see
[frontend.md → Image optimization](frontend.md#image-optimization).

See [`frontend.md#blocks`](frontend.md#blocks) for styling hooks and custom-set rendering.

## Sets (reusable blocks)

Sets are reusable block components defined under **Admin → Settings → Sets**. Each set has:

- A handle (e.g. `quote`).
- A label.
- A list of fields (text, textarea, blocks, date, boolean, select, relationship, asset).

Sets show up inside the rich-text editor as their own block type (`vulse-set`). When defined in a blueprint's `blocks()` field, you can restrict which sets are insertable via the schema editor.

On the frontend, the **Vue** `BlockRenderer` accepts a `components` map keyed by `set:<handle>`. See [`frontend.md#custom-sets`](frontend.md#custom-sets).

## Replicators (collection-level lists of typed blocks)

A **replicator** is a collection-level field (not part of the rich-text body) that stores an ordered list of typed sections — like Statamic's "Bard with sets" outside a rich-text editor. Common use: a page made of stacked sections (Hero, FAQ, CTA).

Define a replicator field in the schema editor with **kind: replicator**, then list the sets it accepts. The stored shape is:

```json
[
  { "set": "hero", "content": { "title": "Welcome", "image": "media-id" } },
  { "set": "cta",  "content": { "label": "Get started", "url": "/signup" } }
]
```

On the frontend, dispatch by `item.set` — `BlockRenderer` is **not** used here:

```astro
---
import Hero from '../components/sections/Hero.astro'
import Cta from '../components/sections/Cta.astro'

const sections = entry.data.sections ?? []
---
{sections.map((item) => {
  if (item.set === 'hero') return <Hero {...item.content} />
  if (item.set === 'cta') return <Cta {...item.content} />
})}
```

For larger sites, use a component map keyed by `item.set`.

## Globals

**Globals** are site-wide content sets (Statamic-style) that aren't tied to a URL or a collection entry. Use them for footer copy, contact details, social links, default SEO text — anything your layout needs on every page.

Manage them under **Admin → Settings → Globals**. Each global set has its own field schema and content values. Reading happens through a public, unauthenticated API:

```txt
GET /api/vulse/public/globals               → all globals, keyed by handle
GET /api/vulse/public/globals/:handle       → a single set's content object
```

See [`api-reference.md#globals`](api-reference.md#globals) for response shapes and [`frontend.md#globals`](frontend.md#globals) for usage in layouts.

> ⚠️ **All global values are public.** Don't put secrets, API keys, or raw analytics scripts in globals.

## Locales (i18n)

Each entry can carry one or more locale translations. The data model splits the entry into a single-identity shell (id, parent, tree position) and a per-locale row that owns `slug`, `status`, `content`, `draft_content`, and `version`. That means:

- The same entry can have different slugs in different languages (`hello-world` / `bonjour-le-monde`).
- A translation can be published in English while still draft in French.
- The tree structure (`parent_id`, `sort_order`) is shared across locales — moving an entry moves it for every language.

### Enabling locales

Open **Admin → Settings → Site** and edit:

- **Supported locales** — comma-separated BCP-47 codes (e.g. `en, nb-NO`). The literal `default` is allowed for sites that don't ship multilingual content.
- **Default locale** — the locale used when none is specified. Must appear in the supported list.

Until you change these, Vulse uses a single locale called `default` and the UI hides the locale switchers.

### Authoring translations

In the entry editor, switching the **Locale** dropdown reloads with `?locale=xx`:

- If a translation exists, it loads.
- If it doesn't, the form is blank with a "No translation yet" banner. Saving creates the new locale row.

The collection list page (`/admin/collections/:name`) and the tree view both honour the `locale` query string. Entries that don't yet have a translation in the active locale are hidden from the list.

### Reading translations from your site

- **Loader (SSG)** — `vulseLoader({ collection: 'post', locale: 'en' })` syncs only entries that have an `en` translation.
- **Runtime SDK (SSR)** — every method on `rt.sdk.collections.*` accepts a `locale` option. Same for `rt.sdk.search.query({ locale })`.
- **REST API** — endpoints accept `?locale=…` (GET / DELETE) or a `locale` field in the request body (POST / PUT). Returns 422 if the locale isn't supported by the site.

See [`frontend.md#locales`](frontend.md#locales) for end-to-end examples including locale-prefixed routes.

### Adding a new locale at runtime

```http
POST /api/vulse/entries/:collection/:id/locales
{
  "locale": "fr",
  "slug": "bonjour-le-monde",
  "content": { "title": "Bonjour le monde", ... },
  "status": "draft"
}
```

The admin UI calls this automatically when you save a missing translation for the first time.

## Validation and content errors

Saving an entry runs the blueprint's Zod schema. Failures produce a structured error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION",
    "message": "cover: This field is required. (and 1 more issue)",
    "details": {
      "issues": [
        { "path": ["cover"], "message": "This field is required.", "code": "invalid_type" },
        { "path": ["title"], "message": "Must be at least 1 characters.", "code": "too_small" }
      ]
    }
  }
}
```

The admin entry form maps these onto the offending fields and shows inline errors. If you call the API directly from your own client, `details.issues` carries the same per-field messages.

## Field-rename safety

When you rename a field in the schema editor (or in code with a `previousName` marker), Vulse migrates existing entry JSON in both `content` and `draft_content` on every locale row. This means you can rename fields without writing migration code — Vulse handles it on save.
