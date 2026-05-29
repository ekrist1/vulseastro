# Troubleshooting

If a fix below doesn't solve your issue, please open an issue with the version of Vulse, your `wrangler.toml` (with secrets redacted), and the exact terminal/console output.

## Install and startup

### Admin routes return 404

- Restart the dev server after upgrading Vulse or changing the integration.
- Kill stale Astro processes (`pkill -f "astro dev"`) — old instances may not have injected routes.
- Check the terminal for the actual port; if `4321` is busy, Astro picks another.

### Vite / SSR cache errors after config changes

```bash
rm -rf node_modules/.vite
pnpm dev
```

### `Vulse: D1 binding "DB" is missing`

- Make sure `wrangler.toml` has the `[[d1_databases]]` block with `binding = "DB"`.
- Confirm the Cloudflare adapter has `platformProxy: { enabled: true }` in `astro.config.mjs`.

### `Vulse: R2 binding "BUCKET" is missing`

Add an `[[r2_buckets]]` block with `binding = "BUCKET"`. R2 is required even when Cloudflare Images is not configured — uploads land in R2 either way.

### `BETTER_AUTH_SECRET missing`

Add it to `[vars]` in dev or as a wrangler secret in production. Use a long random string (32+ characters):

```bash
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

### `Vulse: nodejs_compat flag is missing`

Add it to `wrangler.toml`:

```toml
compatibility_flags = ["nodejs_compat"]
```

This is needed for media uploads (image probing reads from a Node-style stream).

## Sign-in and sessions

### Sign-in returns 403 / CSRF issues

Better Auth expects a matching `Origin` header. The admin login form sends this automatically. If you're calling `/api/auth/sign-in/email` from your own client, set `Origin` to your site URL.

### `/admin/login` accepts credentials but bounces back to login

Cookies are scoped to your origin. If you're testing on `localhost:4321` and the worker is listening on another origin (custom dev domain), session cookies won't survive the redirect. Match the origins.

### Public sign-up rejected

Public sign-up is **disabled by default**. Enable it in **Admin → Settings → Auth**, or:

```bash
wrangler d1 execute DB --local --command \
  "INSERT INTO vulse_settings (key, value, updated_at) VALUES ('allowMemberSignUp', true, $(date +%s)000) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
```

Restart dev so the runtime cache is invalidated.

## Content and entries

### Content Layer / `getCollection` returns empty

- Confirm the entries are **published** (drafts are excluded by default).
- Run `npx vulse migrate` if the DB is fresh.
- Restart `pnpm dev` after creating `src/content.config.ts` — Astro 6 reads from `src/content.config.ts`, not `src/content/config.ts`.
- If you have locales enabled, the loader filters by locale — make sure the configured `defaultLocale` matches the locale your entries were authored in (or pass `locale: 'en'` etc. to `vulseLoader`).

### "Content validation failed" / "This field is required."

Vulse runs the blueprint's Zod schema on save. The validation error envelope carries per-field issues at `error.details.issues`. The admin entry editor displays these inline under each offending field. If you're calling the API from your own client, read `details.issues` to surface them yourself.

### Slug-collision auto-suffix

If you save with a slug that already exists in the same `(collection, locale)`, Vulse silently appends `-2`, `-3`, … to keep it unique and returns the resolved slug in the response. The admin UI shows an amber notice and updates the field.

### Renaming a field deleted my data

Use the **schema editor** to rename fields (or call `PATCH /api/vulse/blueprints/:handle` with a `previousName` marker). Vulse migrates existing entry JSON for both `content` and `draft_content` on every locale row when you save. Manually editing the JSON definition without the rename marker is what causes data loss.

## Media

### Uploads fail with `nodejs_compat`-style errors

Set `compatibility_flags = ["nodejs_compat"]` in `wrangler.toml`. The image-probe step reads dimensions from the uploaded buffer using Node-style streams.

### Image previews show placeholders

- Without `CF_IMAGES_ACCOUNT_HASH` and `CF_IMAGES_TOKEN`, Vulse falls back to R2-proxied URLs (`/api/vulse/media/:id/file`). This works, just isn't variant-optimised.
- For Cloudflare Images, ensure both secrets are set and the bucket is connected to your Images account.

### Deleted media still appears in the picker

`DELETE /api/vulse/media/:id` is a soft delete. The asset is hidden from the picker but the row stays for 7 days. The scheduled cron handler hard-purges after that. To force-purge:

```bash
wrangler d1 execute DB --local --command "DELETE FROM vulse_media WHERE deleted_at IS NOT NULL;"
```

## Live preview

### "Failed to start live preview"

Live preview requires an `admin` or `editor` session. Open `/admin/login` first.

### The iframe loads but never updates as I type

Check the `preview.rootSelector` on the blueprint matches an element in your rendered HTML. The default is `<main>`. If your layout doesn't use `<main>`, set:

```ts
preview: { path: '/blog/{slug}', rootSelector: 'article' }
```

### Live preview shows the published content, not my draft

`resolvePreviewContent(entry, Astro.locals)` must be called inside an SSR page. SSG pages (`output: 'static'` or a page without server fallback) cannot reflect the unsaved live session because the page isn't rendered per request.

## Forms

### Form submissions silently disappear

You probably have a honeypot field set. Any non-empty value in the field named `_hp` (or the configured honeypot name) is treated as spam — Vulse returns a fake success and doesn't store the submission.

### "Rate limit exceeded"

Default limits are 10 submissions per IP per hour per form. Edit the form definition in **Admin → Forms** to raise the limit. The rate-limit table is `vulse_form_rate_limits` if you need to clear it manually.

### Async hooks never run

You need a Cloudflare Queue. Add `FORM_QUEUE` to `wrangler.toml` and export the consumer:

```ts
export default {
  async queue(batch, env) { await vulseFormQueue(batch, env) },
}
```

Without `FORM_QUEUE`, submissions still land in D1 — only the async side-effects (emails, webhooks, queued plugin hooks) are skipped.

## i18n / locales

### `Locale 'xx' is not enabled for this site.` (422)

Configure the locale in **Admin → Settings → Site → Supported locales** first. The `locales` setting and the `defaultLocale` are stored in `vulse_settings`; the runtime rejects any locale code that isn't in the list.

### The editor doesn't show a locale switcher

It only shows when more than one locale is configured. With a single locale (the default), it's hidden to avoid clutter.

### Existing entries don't appear after enabling a new locale

That's by design — adding a locale doesn't auto-translate existing entries. Open the entry, switch to the new locale via the dropdown, and save to create the translation row.

## TypeScript

### Type errors for collections / `getCollection` returns `unknown`

Ensure `.vulse/types.d.ts` is in `tsconfig.json` `include`:

```json
{ "include": [".astro/types.d.ts", ".vulse/types.d.ts", "**/*"] }
```

Regenerate by restarting dev — the integration writes types on `astro:config:setup`.

### `Cannot find module 'vulse/server'`

Confirm `vulse` is in your dependencies and you re-ran `pnpm install` after upgrading. If you're using a monorepo with `workspace:*`, you may also need:

```bash
pnpm --filter @vulsecms/core build
```

to rebuild the `dist/` files the package exports.

## Production

### `Vulse: D1 binding "DB" is missing` in production

Cloudflare Pages and Workers need bindings declared at the platform level, not just in `wrangler.toml`. Open the Cloudflare dashboard → Workers/Pages → your project → Settings → Bindings, and add `DB` (D1) and `BUCKET` (R2) explicitly. Re-deploy after.

### Deploys succeed but new migrations don't run

The runtime applies migrations on the first request after a deploy. If you want to apply them ahead of time:

```bash
npx vulse migrate --remote -c wrangler.production.toml
```

(Pass `-c wrangler.production.toml`, or set `WRANGLER_CONFIG`, so `--remote` targets your production `database_id` rather than the dev `wrangler.toml`.)

Check the ledger to see what's applied:

```bash
wrangler d1 execute DB --remote --command \
  "SELECT id, datetime(applied_at/1000, 'unixepoch') FROM _vulse_migrations ORDER BY id;"
```

### Worker exceeds CPU time

The most expensive paths are full-text search and tree builds. If you see CPU-limit errors:

- Bound `search.query` with `limit: 20` or less.
- Avoid `tree()` on collections with >1000 entries — paginate manually.
- Move heavy listing pages to SSG via the loader and revalidate on publish.

## Still stuck

- Check the [release notes](https://github.com/vulsecms/vulse/releases) for behaviour changes between versions.
- Cross-reference [`directory-structure.md`](directory-structure.md) to confirm files are where they should be.
- Re-read [`installation.md`](installation.md) end to end — most environment issues come from a half-finished install.
