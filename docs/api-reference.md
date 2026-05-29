# API reference

Vulse exposes a REST API at `/api/vulse/*`. All non-public endpoints require a staff session cookie (created by `/admin/login` or `/api/auth/sign-in`). Public endpoints are explicitly noted.

## Response envelope

Every endpoint returns one of:

```json
{ "ok": true,  "data": <payload> }
{ "ok": false, "error": { "code": "...", "message": "...", "details": { ... } } }
```

Error `code` is one of:

| Code | HTTP | Meaning |
|------|:----:|---------|
| `VALIDATION` | 422 | Body/params failed schema validation. `details.issues` is an array of `{ path, message }`. |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `ACCESS_DENIED` | 403 | The session lacks permission |
| `CONFLICT` | 409 | E.g. duplicate handle on create |
| `INTERNAL` | 500 | Unexpected error (server logs it) |

## Authentication

Vulse delegates authentication to [Better Auth](https://better-auth.com). Routes are mounted at `/api/auth/*`:

```txt
POST /api/auth/sign-in/email     body: { email, password }
POST /api/auth/sign-up/email     body: { email, password, name }
POST /api/auth/sign-out
GET  /api/auth/get-session
```

The set-cookie response from `sign-in` is what authenticates subsequent admin requests. Use `vulse/client/auth` from the browser for a CSRF-safe wrapper.

## Entries

```txt
GET    /api/vulse/entries/:collection                  list entries for a locale
GET    /api/vulse/entries/:collection/tree             tree-shaped list (when blueprint has tree:true)
GET    /api/vulse/entries/:collection/:id              fetch one entry
POST   /api/vulse/entries/:collection                  create
PUT    /api/vulse/entries/:collection/:id              update
DELETE /api/vulse/entries/:collection/:id              delete entire entry (all locales)
GET    /api/vulse/entries/:collection/:id/locales      list available translations
POST   /api/vulse/entries/:collection/:id/locales      add a new translation
PATCH  /api/vulse/entries/:collection/:id/move         move in tree
POST   /api/vulse/entries/:collection/:id/publish      publish current draft (drafts mode)
```

### List / get — query params

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `locale` | string | `defaultLocale` | The locale to return. 422 if not in the configured `locales` list. |
| `parentId` | string \| `root` | unset | Tree only — filter by parent. `root` means top-level. |

The list endpoint applies the blueprint's `read` access rule. Anonymous traffic gets published-only.

### Create — body

```json
{
  "slug": "hello-world",
  "content": { "title": "Hello", "...": "..." },
  "status": "draft",                // optional; "draft" | "published"
  "parentId": "abc",                // optional; only for tree collections
  "locale": "en"                    // optional; defaults to defaultLocale
}
```

Returns the created `EntryRow`. Slug collisions auto-suffix (`hello-world-2`, `…-3`).

### Update — body

```json
{
  "slug": "renamed-slug",            // optional
  "content": { ... },                // optional
  "status": "published",             // optional
  "publish": true,                   // optional; drafts mode shortcut
  "changeSummary": "Fixed typo",     // optional; saved on the revision
  "locale": "en"                     // optional; targets a single locale row
}
```

Update creates a new entry revision. To delete a single locale's translation without removing the entire entry, use `DELETE /api/vulse/entries/:c/:id?locale=fr`.

### Move — body

```json
{ "parentId": "abc-or-null", "sortOrder": 2 }
```

Server rejects moves that would create a cycle in the tree.

## Revisions

```txt
GET  /api/vulse/entries/:collection/:id/revisions                  list versions
POST /api/vulse/entries/:collection/:id/revisions/:version/restore restore a version
```

Both accept `?locale=` to scope to one translation. Restore creates a new revision (it doesn't rewrite history) summarised as "Restored v<n>".

## Search

```txt
POST /api/vulse/search
```

Body:

```json
{
  "q": "astro",
  "collections": ["post", "page"],
  "limit": 10,
  "includeDrafts": false,
  "locale": "en"
}
```

`includeDrafts: true` is ignored unless the caller is `admin` or `editor`. Returns:

```json
{
  "ok": true,
  "data": [
    { "entryId": "...", "collection": "post", "locale": "en", "slug": "hello", "title": "Hello", "snippet": "...<mark>astro</mark>..." }
  ]
}
```

## Media

```txt
GET    /api/vulse/media                  list (admin)
GET    /api/vulse/media/:id              one record
GET    /api/vulse/media/:id/file         the file (admin/editor only — used by the admin UI)
GET    /api/vulse/public/media/:id/file  the file (public, cacheable — use on your frontend)
POST   /api/vulse/media                  upload (multipart, admin)
PATCH  /api/vulse/media/:id              update alt text
DELETE /api/vulse/media/:id              soft-delete (purged by cron after 7 days)
```

## Users

```txt
GET   /api/vulse/users                list users (admin)
PATCH /api/vulse/users/:id/role       change role (admin)
```

## Blueprints (schema editor)

```txt
GET    /api/vulse/blueprints              list (admin/editor)
GET    /api/vulse/blueprints/:handle      one (admin/editor)
POST   /api/vulse/blueprints              create (admin)
PATCH  /api/vulse/blueprints/:handle      update — supports field renames (admin)
DELETE /api/vulse/blueprints/:handle      delete (admin)
```

## Sets

```txt
GET    /api/vulse/sets                  list
GET    /api/vulse/sets/:handle          one
POST   /api/vulse/sets                  create
PATCH  /api/vulse/sets/:handle          update
DELETE /api/vulse/sets/:handle          delete
```

## Globals

Admin:

```txt
GET    /api/vulse/globals                       list (admin/editor)
GET    /api/vulse/globals/:handle               one (admin/editor) → { set, value }
POST   /api/vulse/globals                       create definition (admin)
PUT    /api/vulse/globals/:handle               update definition (admin)
PUT    /api/vulse/globals/:handle/value         update content only (admin)
DELETE /api/vulse/globals/:handle               delete (admin)
```

Public (unauthenticated):

```txt
GET /api/vulse/public/globals                   all globals, keyed by handle
GET /api/vulse/public/globals/:handle           a single set's content object
```

Public responses:

```json
// /api/vulse/public/globals
{
  "ok": true,
  "data": {
    "site":   { "siteName": "Vulse", "tagline": "Content everywhere" },
    "footer": { "copyright": "© 2026 Vulse" }
  }
}

// /api/vulse/public/globals/site
{ "ok": true, "data": { "siteName": "Vulse", "tagline": "Content everywhere" } }
```

> All global values are public — don't store secrets here.

## Forms

Public:

```txt
GET  /api/vulse/forms/:handle/public            form schema for client-side validation
POST /api/vulse/forms/:handle/submit            submit a form (JSON)
POST /api/vulse/forms/:handle/upload            upload a file (multipart, returns mediaId)
```

Admin:

```txt
GET    /api/vulse/forms                                   list forms
GET    /api/vulse/forms/:handle                           form + recent submissions
PATCH  /api/vulse/forms/:handle                           update form
DELETE /api/vulse/forms/:handle                           delete form
GET    /api/vulse/forms/:handle/submissions               list submissions
POST   /api/vulse/forms/:handle/submissions/delete        bulk delete
GET    /api/vulse/forms/:handle/submissions/:id           one submission
DELETE /api/vulse/forms/:handle/submissions/:id           delete one
```

## Live preview sessions

```txt
POST   /api/vulse/preview/sessions          create a session (admin/editor)
PUT    /api/vulse/preview/sessions/:id      update content (owner-only)
DELETE /api/vulse/preview/sessions/:id      end session (owner-only)
GET    /api/vulse/preview/start             set saved-draft cookie and redirect
GET    /api/vulse/preview/stop              clear cookie
GET    /api/vulse/preview/bridge.js         JS shim loaded by previewed pages
```

Live-preview create body:

```json
{
  "collection": "post",
  "entryId": "abc",
  "slug": "hello",
  "content": { ... },
  "locale": "en"
}
```

Returns `{ id, previewUrl, expiresAt }`.

## Settings

```txt
GET /api/vulse/settings              read all settings (admin)
PUT /api/vulse/settings/:key         set one setting (admin)
```

`PUT` body: `{ "value": <any JSON> }`.

Auth-related keys (`allowMemberSignUp`, `allowedSignUpDomains`) invalidate the runtime cache on the next request.

## CORS

The API is same-origin only. There is no built-in CORS allow-list — admin routes set `credentials: 'same-origin'` and public routes can be called from your own pages without preflight. If you need to call the API from another origin, add CORS headers in your worker entry.
