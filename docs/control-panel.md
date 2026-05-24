# Control panel

The Vulse admin UI is served by your own Astro app under `/admin` (configurable via the integration's `adminPath` option). It uses the same session store as your end-user sign-in flow but requires a role of `admin` or `editor`.

## Route map

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard with shortcuts to your collections |
| `/admin/login` | Staff sign-in |
| `/admin/collections/:name` | Entry list / tree view for a collection |
| `/admin/collections/:name/new` | Create a new entry |
| `/admin/collections/:name/:id` | Edit an entry (with live preview if enabled) |
| `/admin/collections/:name/:id/revisions` | Version history for an entry |
| `/admin/schema/:handle` | Blueprint editor (incl. scaffold frontend panel) |
| `/admin/schema/new` | Create a new collection blueprint |
| `/admin/media` | Asset library |
| `/admin/forms` | Form builder |
| `/admin/forms/:handle` | Edit a form |
| `/admin/forms/:handle/submissions` | Submissions list |
| `/admin/forms/:handle/submissions/:id` | Submission detail |
| `/admin/users` | User management (admin-only) |
| `/admin/settings` | Site settings (site name, deploy hook, locales) |
| `/admin/settings/auth` | Auth settings (sign-up toggle, domain allowlist) |
| `/admin/settings/sets` | Reusable block sets |
| `/admin/settings/globals` | Site-wide content sets (footer, contact info, etc.) |

## Sidebar structure

The sidebar groups items into:

- **Collections** — one link per collection blueprint
- **Forms** — form builder
- **Media** — asset library
- **Schema** — collection blueprints (collapsible), plus Sets and Globals (admin only)
- **Users** — user management (admin only)
- **Settings** — Site and Auth (admin only)

## Roles and what they can do

| Capability | `admin` | `editor` | `member` |
|------------|:------:|:--------:|:--------:|
| Sign in to `/admin` | ✅ | ✅ | ❌ |
| List and read entries | ✅ | ✅ | (per access rule) |
| Create / edit / publish entries | ✅ | ✅ | ❌ |
| Delete entries | ✅ | (per access rule) | ❌ |
| Manage media | ✅ | ✅ | ❌ |
| Read form submissions | ✅ | ✅ | ❌ |
| Edit blueprints / sets / globals | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Edit settings | ✅ | ❌ | ❌ |

Per-collection access rules in your blueprint can override the defaults — see [`content-modeling.md#access-rules`](content-modeling.md#access-rules).

## Editing entries

The entry editor renders fields generated from your blueprint schema. Notable UI behaviours:

- **URL slug** is collapsed by default. It auto-generates from the `titleField` until you type into it. Saving with a duplicate slug auto-appends `-2`, `-3`, … to keep it unique within the collection (and locale, if you have several).
- **Status badge** shows `draft`, `published`, or `published · changes` when drafts are enabled and unsaved changes exist.
- **Save buttons** depend on whether the collection has drafts enabled:
  - With drafts: `Save draft` and `Save & publish`. A `Publish` button appears alongside when there is a draft over a published entry.
  - Without drafts: a single `Save` button with a status select (`draft` / `published`).
- **Validation errors** appear inline below the offending field. Missing required fields read "This field is required."; bad slugs read "Use lowercase letters, numbers, and hyphens only."
- **Locale switcher** appears at the top when more than one locale is configured (see [`content-modeling.md#locales-i18n`](content-modeling.md#locales-i18n)). Switching navigates to `?locale=xx`; the form loads the per-locale content if it exists, or an empty form so you can author the translation.

## Editing the blueprint (schema)

`/admin/schema/:handle` lets you edit a collection's blueprint at runtime. You can:

- Rename the **label**.
- Add, remove, and rename fields. Renames safely migrate existing entry JSON (both `content` and `draft_content`) when you save.
- Toggle `singleton`, `tree`, `drafts`, and `maxDepth`.
- Click **Scaffold frontend** to generate Astro page templates (see [`cli.md#vulse-collectionscaffold`](cli.md#vulse-collectionscaffold)).

The **Handle** field is locked after creation. Changing it would break admin URLs, public API paths, and any frontend code that imports or references the collection by name. To rename, create a new collection and migrate entries.

## Media library

`/admin/media` lists every uploaded asset. The picker is reused by the entry editor's media fields and by the block editor.

- Uploads land in R2 under `media/<id>`.
- Image dimensions are extracted on upload (used for `<img>` width/height hints).
- Soft-deleted assets are kept for 7 days. The scheduled cron handler hard-purges them after that — see [`deployment.md#cron`](deployment.md#cron).

## Forms

`/admin/forms` is the form builder. Each form has:

- A handle (used in `<FormRenderer form="…">`).
- Field definitions (type, label, required, validation).
- A success message / redirect.
- Notification email recipients (sent via your queue consumer).

Submissions appear under `/admin/forms/:handle/submissions` with detail, bulk delete, and CSV export. See [`forms.md`](forms.md) for the full feature set.

## Settings

- **Site** — site name, deploy-hook URL, supported locales, default locale.
- **Auth** — public sign-up toggle, allowed email domains.
- **Sets** — reusable block sets ("Quote", "Callout", etc.) that appear inside the rich-text editor.
- **Globals** — site-wide content sets exposed at `/api/vulse/public/globals` for use in your layouts.

## Live preview

Each entry editor includes a split-panel live preview when the collection's blueprint enables it (`preview.live !== false`). As you type, an iframe re-renders against an unsaved preview session. There's also a **Preview** button in the toolbar that opens the saved draft in a new tab.

See [`live-preview.md`](live-preview.md) for the full mental model and a guide on wiring it up in your Astro pages.
