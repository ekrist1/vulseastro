# AI schema docs

Vulse can export your content schema as static files that AI coding tools read directly — no MCP server required.

## When to export

Run schema export after you:

- add or change collections in `src/vulse/collections/`
- edit sets or globals in the admin UI
- want AI to scaffold Astro pages and components from your current content model

## Command

From your Astro project root:

```bash
npx vulse schema:export              # local D1 (includes sets/globals)
npx vulse schema:export --remote     # production D1
```

Generated files:

| File | Purpose |
|------|---------|
| `AGENTS.md` | Short onboarding for AI tools — collection summary, frontend rules |
| `docs/vulse-schema.md` | Full human-readable schema reference |
| `docs/vulse-schema.json` | Machine-readable schema snapshot (`version: 1`) |

Commit these files so your team (and AI) share the same schema context.

If D1 is unavailable (no `wrangler.toml` or local DB), the command still runs using **code blueprints only**. Sets and globals are omitted and a warning is included in the output.

## Using with AI tools

In Cursor, Claude Code, or similar:

1. `@`-mention `AGENTS.md` for quick project context.
2. `@`-mention `docs/vulse-schema.md` (or `.json`) when generating pages that must match field names, types, and relationships.

Example prompt:

> Read `AGENTS.md` and `docs/vulse-schema.md`, then generate index and detail pages for every collection using each collection's preview path.

## Auto-regeneration (optional)

Enable export on every `astro dev` / `astro build`:

```js
// astro.config.mjs
import vulse from '@vulsecms/core/integration'

export default defineConfig({
  integrations: [vulse({ schemaDocs: true })],
})
```

Default is **off** — committed docs should update when you intentionally run `vulse schema:export` or opt in.

## What's included

- **Collections** — fields, widgets, validation, admin config, preview paths
- **Sets** — block type field shapes (for `BlockRenderer`)
- **Globals** — site-wide value schemas
- **Relationships** — entry, reference, and link edges between collections
- **Frontend cookbook** — Content Layer loader vs runtime SDK patterns

Forms are not included in v1 (separate domain, less relevant for page codegen).

See also [`cli.md`](cli.md) for command flags.
