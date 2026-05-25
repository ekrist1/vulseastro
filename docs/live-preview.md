# Live preview

Vulse has two preview mechanisms that work together:

| Mechanism | Trigger | Content source | Writes to DB? |
|-----------|---------|----------------|---------------|
| **Live preview panel** | Typing in the entry editor | A short-lived preview session (token = `vulse_live_preview`) | Never |
| **Preview button** | Clicking **Preview** in the editor toolbar | Saved draft (token = `vulse_preview`) | Only after you saved |

Both can be active at once. The runtime helper `resolvePreviewContent()` picks the right content with the priority: **live session → saved draft → published**.

## How the live panel works

1. When the entry editor mounts, it `POST`s to `/api/vulse/preview/sessions` and gets back a session ID + a preview URL like `/blog/my-post?vulse_live_preview=<token>`.
2. As you edit fields, the editor `PUT`s the new content to `/api/vulse/preview/sessions/:id` (debounced). The session has a 1-hour TTL that is renewed on every update.
3. The iframe loads the preview URL — your normal Astro page, with the preview token in the query string.
4. Inside the page, `resolvePreviewContent()` sees the token, fetches the session content, and returns it instead of the saved entry.
5. After each `PUT` the editor `postMessage`s `vulse.preview.updated` to the iframe; the page's preview bridge does a soft DOM morph so the iframe doesn't flicker.

The session content is private to the editor — it isn't searchable, doesn't trigger publish-time work, and never touches the published row.

## How the Preview button works

The toolbar's **Preview** button opens `/api/vulse/preview/start?to=<page>`, which sets a signed cookie (`vulse_preview`) and redirects to your page. While the cookie is present, `resolvePreviewContent()` prefers the saved-draft content over the published content. The cookie is short-lived and cleared by `/api/vulse/preview/stop`.

## Wiring an Astro page

```astro
---
import {
  getRuntimeEnv,
  getRuntime,
  createDb,
  registryForRequest,
  resolvePreviewContent,
} from '@vulsecms/core/server'

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

const entry = await rt.sdk.collections.findBySlug('post', Astro.params.slug!, {
  audience: session?.user ?? null,
})
if (!entry) return new Response(null, { status: 404 })

const content = resolvePreviewContent(entry, Astro.locals)
---
<h1>{content.title}</h1>
```

`resolvePreviewContent` reads tokens from `Astro.locals` (populated by the Vulse middleware) and returns the right content object for this request. Without any preview tokens, it returns the published `entry.content`.

## Blueprint options

```ts
preview: {
  path: '/blog/{slug}',
  rootSelector: 'article',   // DOM morph target; defaults to 'main'
  live: false,               // hide the inline panel; the Preview button still works
}
```

`{slug}` is substituted with the entry's current slug. Set `rootSelector` when your layout doesn't wrap content in `<main>`. Set `live: false` to disable the inline panel for collections that should only use the saved-draft Preview flow.

## SSR is required for the inline panel

The live preview panel only works on server-rendered pages (`output: 'server'` in `astro.config.mjs`). Loader-only SSG pages can't reflect unsaved session state because they don't run on every request.

The **Preview button** flow (signed cookie + saved draft) may still work on SSG pages if you have an SSR fallback, because the draft is in the DB by the time the cookie redirect happens.

## Common pitfalls

- **The preview panel says "Failed to start live preview".** The session create call requires a logged-in `admin` or `editor`. Open `/admin/login` first.
- **The iframe never updates as I type.** Check `rootSelector` matches an element in your layout. The morph requires the matching root element to exist in the rendered HTML.
- **Preview shows the published content, not my draft.** `resolvePreviewContent` must be called with `Astro.locals` from a request that includes either the preview cookie or the live-preview query token. SSR pages get this automatically; SSG pages do not.
- **I want to disable preview for a collection.** Set `preview.live: false` on the blueprint, or remove the `preview` block entirely. The editor will hide the panel and the Preview button.

## Lifecycle and cleanup

Preview sessions live in the `vulse_preview_sessions` table with a 1-hour TTL. The scheduled cron handler (see [`deployment.md#cron`](deployment.md#cron)) purges expired sessions on its run.

A session is also explicitly deleted when:

- The editor is closed cleanly (the form's `beforeUnload` posts a `DELETE`).
- Another user attempts to read it (`findById` checks `userId` and returns null if the session isn't theirs).
