# Schema definitions (import & templates)

Vulse can **import collection blueprints from a JSON bundle**. This lets you version,
share, and reuse schemas — and bootstrap a project from one of the built-in industry
templates. Bundles can be imported from the admin UI (**Schema → Import / templates**) or
with the CLI (`vulse schema:import`).

This document describes the bundle file format so you can author your own definitions by
hand or with an AI assistant. For the conceptual model behind fields and collections, see
[content-modeling.md](content-modeling.md).

## Bundle format

A bundle is a single JSON file describing one or more collections (typically one "industry").
It is self-contained: any collection referenced by a `relationship` field should be included
in the same bundle.

```json
{
  "version": 1,
  "name": "Documentation site",
  "description": "Pages grouped into sections, written by authors.",
  "blueprints": [
    { "handle": "author", "label": "Author", "singleton": false, "fields": [ /* … */ ] }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | `1` | yes | Bundle format version. |
| `name` | string | no | Human label, shown in the template gallery. |
| `description` | string | no | One-line summary. |
| `blueprints` | array | yes | One or more blueprint definitions (see below). At least one. |

### Blueprint definition

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `handle` | string | yes | Collection id. Must match `^[a-z][a-z0-9_-]*$`. Unique per project. |
| `label` | string | yes | Display name. |
| `singleton` | boolean | yes | `true` for a single-entry collection. Cannot combine with `tree`. |
| `tree` | boolean | no | Enable hierarchy (nestable entries). |
| `maxDepth` | integer | no | Max nesting depth; requires `tree: true`. |
| `drafts` | boolean | no | Enable draft/published workflow. |
| `seo` | boolean | no | Adds an SEO field group (meta title/description, OG image). |
| `seoMapping` | object | no | Maps content fields to SEO defaults: `{ metaTitle, metaDescription, ogImage }` (each a field name). |
| `preview` | object | no | Live preview: `{ "path": "/docs/{slug}", "rootSelector"?, "live"? }`. `path` must start with `/` and contain `{slug}`. |
| `fields` | array | yes | At least one field (see below). |

### Field definition

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Field id. Must match `^[a-zA-Z_][a-zA-Z0-9_]*$`. Unique within the collection. |
| `label` | string | no | Display name. |
| `ui` | object | yes | The field type + its config (see kinds below). |
| `optional` | boolean | yes | Whether the field may be empty. |
| `default` | any | no | Default value. |
| `validation` | object | no | `{ "min"?, "max"? }` (integers). |

## Field kinds (`ui.kind`)

| Kind | Extra `ui` properties | Stored value |
|------|-----------------------|--------------|
| `text` | — | string |
| `textarea` | — | string |
| `blocks` | `sets?` (array of block-set handles) | rich-content document |
| `date` | — | date |
| `boolean` | — | boolean |
| `select` | `options` (required, ≥1), `multiple?`, `clearable?`, `placeholder?` | key / key[] |
| `relationship` | `to` (required: target collection handle) | entry id |
| `entry` | `collections` (required, ≥1 handles) | entry id |
| `entries` | `collections` (required, ≥1), `max?` | entry id[] |
| `link` | `collections?` | `{ type: "url" \| "entry" \| "first-child", … }` |
| `asset` | — | media id |
| `grid` | `fields` (required, ≥1 nested fields), `minRows?`, `maxRows?`, `mode?` (`table`\|`stacked`), `addLabel?` | row object[] |
| `replicator` | `sets` (required, ≥1: `{ name, label?, fields }`) | `{ set, content }[]` |

**`select` options** are either plain strings or `{ "key": "...", "label": "..." }` objects.

**Nested fields** (inside `grid.fields` and `replicator.sets[].fields`) use the same field
shape but **cannot** be `grid` or `replicator` themselves.

> Note: there is no numeric field kind. Use `text` for free-form numbers/order, or `select`
> for a fixed set of values.

### Example with complex fields

```json
{
  "handle": "product",
  "label": "Product",
  "singleton": false,
  "drafts": true,
  "seo": true,
  "preview": { "path": "/products/{slug}" },
  "fields": [
    { "name": "title", "ui": { "kind": "text" }, "optional": false },
    { "name": "slug", "ui": { "kind": "text" }, "optional": false },
    { "name": "category", "ui": { "kind": "relationship", "to": "product_category" }, "optional": true },
    {
      "name": "gallery",
      "ui": {
        "kind": "grid",
        "mode": "stacked",
        "fields": [
          { "name": "image", "ui": { "kind": "asset" }, "optional": false },
          { "name": "caption", "ui": { "kind": "text" }, "optional": true }
        ]
      },
      "optional": true
    },
    { "name": "body", "ui": { "kind": "blocks" }, "optional": false }
  ]
}
```

## Importing

### From the admin

Go to **Schema → Import / templates**. Pick a built-in template and click **Import**, or
switch to the **Import JSON** tab to paste/upload your own bundle. The result reports which
collections were created, skipped, or failed.

### From the CLI

```bash
# List the built-in templates
npx vulse schema:import --list

# Import a built-in template
npx vulse schema:import --template documentation-site

# Import your own bundle file
npx vulse schema:import ./schema-definitions/my-bundle.json

# Target the remote (production) D1
npx vulse schema:import --template podcast --remote
```

### Conflict handling

Import is **additive**: if a collection `handle` already exists it is **skipped** (and
reported), so importing the same bundle twice is safe. To change an existing collection,
edit it in the admin instead.

### Ordering & references

`relationship` targets must exist before the referencing collection is created. The importer
**topologically orders** the blueprints within a bundle by their relationship references, so
a self-contained bundle imports in any author order. A `relationship.to` that exists neither
in the bundle nor already in the database is reported as a failure (the rest still import).

## Built-in templates

The source files live in [`schema-definitions/`](../schema-definitions) at the repo root and
are bundled into the package:

| Key | Collections |
|-----|-------------|
| `documentation-site` | author, documentation_section, documentation_page |
| `saas-platform` | team_member, feature, pricing_plan, changelog_entry |
| `product-portfolio` | product_category, product |
| `health-wellness` | practitioner, service, wellness_article, testimonial |
| `education` | instructor, course_category, course, lesson |
| `podcast` | host, podcast_episode |
| `real-estate` | agent, neighborhood, property |

## Authoring your own (by hand or with AI)

To generate a bundle with an AI assistant, give it this document (the format tables + field
kinds) and describe your domain. Constraints to enforce: `handle` matches
`^[a-z][a-z0-9_-]*$`; field `name` matches `^[a-zA-Z_][a-zA-Z0-9_]*$`; every field has an
`optional` boolean; `select` needs ≥1 `options`; `relationship.to` points at a collection in
the same bundle (or one that already exists); keep bundles self-contained and acyclic.
Validate by importing with `npx vulse schema:import <file>` — any issues are printed per field.
