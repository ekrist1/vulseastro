# Configuration

Vulse is configured in three places:

1. **`wrangler.toml`** — Cloudflare resource bindings (D1, R2, queues) and environment variables.
2. **`astro.config.mjs`** — Astro integration options (admin path, form hooks).
3. **Runtime settings** — values stored in the D1 `vulse_settings` table, edited in the admin UI under **Settings**.

## `wrangler.toml` bindings

| Binding | Required | Purpose |
|---------|----------|---------|
| `DB` | ✅ | D1 database — content, users, sessions, settings |
| `BUCKET` | ✅ | R2 bucket — uploaded media files |
| `FORM_QUEUE` | optional | Cloudflare Queue for async form processing — see [`forms.md`](forms.md) |
| `SEND_EMAIL` | optional | Cloudflare Email Routing — password reset and form notification emails — see below |

```toml
[[d1_databases]]
binding = "DB"
database_name = "vulse-db"
database_id = "<your-database-id>"
migrations_dir = "node_modules/@vulsecms/core/migrations"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "vulse-media"
```

### Email (`SEND_EMAIL`)

Vulse uses [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/) to send password-reset and form-notification emails. When neither `SEND_EMAIL` nor `EMAIL_FROM` is set, Vulse falls back to logging emails to the console (useful for local development without any email setup).

To enable real email sending:

1. Configure Email Routing for your domain in the Cloudflare dashboard and verify a sending address.
2. Add the binding and `EMAIL_FROM` var to `wrangler.toml`:

```toml
[[send_email]]
name = "SEND_EMAIL"

[vars]
EMAIL_FROM = "noreply@yourdomain.com"
```

**Local development simulation** — `wrangler dev` simulates `send_email` bindings automatically. When the binding is declared, calling `.send()` logs the email payload to the wrangler console instead of actually sending it. Add the `[[send_email]]` block to your dev `wrangler.toml` to see what emails would be sent during local testing. See [local development docs](https://developers.cloudflare.com/email-routing/email-workers/local-development/).

In production, keep `EMAIL_FROM` in `[vars]` (it is not a secret) but do not add a `wrangler secret` for it — the `SEND_EMAIL` binding handles authentication through Cloudflare's platform.

The compatibility flag `nodejs_compat` is required for media uploads:

```toml
compatibility_flags = ["nodejs_compat"]
```

## Environment variables (`[vars]` / secrets)

| Variable | Required | Purpose |
|----------|----------|---------|
| `BETTER_AUTH_SECRET` | ✅ | Session signing — use 32+ random chars in production |
| `BETTER_AUTH_URL` | optional | Override the auth base URL (defaults to the request origin) |
| `VULSE_PREVIEW_SECRET` | optional | Signs the saved-draft Preview cookie. Falls back to `BETTER_AUTH_SECRET`. |
| `EMAIL_FROM` | optional | "From" address for outgoing emails, e.g. `noreply@yourdomain.com`. Required when `SEND_EMAIL` is configured. |
| `CF_IMAGES_ACCOUNT_HASH` | optional | Cloudflare Images account hash for delivery URLs |
| `CF_IMAGES_TOKEN` | optional | Cloudflare Images API token for variant registration |
| `VULSE_IMAGE_TRANSFORM` | optional | `"true"` serves frontend images via Cloudflare Image Transformations (`/cdn-cgi/image`, `format=auto`). Needs Image Resizing + a custom domain. See [frontend.md → Image optimization](frontend.md#image-optimization). |

In development put them under `[vars]` in `wrangler.toml`. In production use:

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put VULSE_PREVIEW_SECRET
wrangler secret put CF_IMAGES_ACCOUNT_HASH
wrangler secret put CF_IMAGES_TOKEN
```

Frontend images are served from the public, cacheable route `/api/vulse/public/media/:id/file`.
With `VULSE_IMAGE_TRANSFORM="true"` they are delivered through Cloudflare Image Transformations
(compressed AVIF/WebP via `format=auto`); without it the original bytes are served. The
admin-only `/api/vulse/media/:id/file` route is used by the admin UI.

## Integration options

Pass options to `vulse()` in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import vulse from '@vulsecms/core/integration'
import { spamFilterPlugin } from './src/vulse/plugins/spam-filter'

export default defineConfig({
  output: 'server',
  integrations: [
    vulse({
      adminPath: '/admin',              // default
      plugins: [
        spamFilterPlugin(),
      ],
    }),
  ],
})
```

Use `plugins` for form, auth, CRM, email, and registration extension points.
Some plugin hooks run in the queue consumer; hooks such as `form:beforeSubmit`
run in the submit handler before storage. See [`plugins.md`](plugins.md).

## Runtime settings (stored in D1)

These live in the `vulse_settings` table and are edited in **Admin → Settings → Site**.

| Key | Default | Purpose |
|-----|---------|---------|
| `siteName` | _empty_ | Display name; shown in admin and available to your layouts |
| `deployHookUrl` | _empty_ | URL pinged after publishing entries (e.g. Cloudflare Pages deploy hook) |
| `defaultLocale` | `default` | The locale used when no `locale` is specified |
| `locales` | `["default"]` | Ordered list of supported locale codes |
| `allowMemberSignUp` | `false` | Whether public member registration is allowed |
| `allowedSignUpDomains` | `[]` | Email domain allowlist (empty = any domain) |

Auth-related settings (`allowMemberSignUp`, `allowedSignUpDomains`) invalidate the runtime cache on the next request, so changes take effect without a redeploy.

Locale settings are read by the entry-management code paths. Adding or removing a locale does not migrate existing rows — see [`content-modeling.md`](content-modeling.md#locales-i18n) for the data model.

### Editing settings via the admin UI

`/admin/settings` — Site settings (site name, deploy hook URL, locales).

`/admin/settings/auth` — Auth settings (sign-up toggle, domain allowlist).

### Editing settings via SQL

```bash
wrangler d1 execute DB --local --command \
  "INSERT INTO vulse_settings (key, value, updated_at) VALUES ('siteName', json('\"My Site\"'), $(date +%s)000) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
```

The `value` column is JSON, so values must be JSON-encoded (strings are double-quoted, arrays use `[ ]`, etc.). The admin UI handles this for you.

## Package exports

| Import | Purpose |
|--------|---------|
| `vulse` | Blueprint helpers (`defineCollection`, `z`, `blocks`, `media`, `ref`) |
| `definePlugin` from `vulse` | Native plugin helper for form/auth hooks |
| `vulse/integration` | Astro integration |
| `vulse/loader` | Content Layer `vulseLoader()` |
| `vulse/server` | Runtime SDK (`getRuntime`, `createSdk`, `getRuntimeEnv`, `createDb`, `registryForRequest`, `resolvePreviewContent`) |
| `vulse/client` | Block types and schemas (for typing on the frontend) |
| `vulse/client/auth` | Browser auth SDK |
| `vulse/client/components/SignInForm.astro` | Headless sign-in form |
| `vulse/client/components/SignUpForm.astro` | Headless sign-up form |
| `vulse/client/components/SignOutButton.astro` | Sign-out button |
| `vulse/client/components/SessionGuard.astro` | Server-side role gate |
| `vulse/client/components/FormRenderer.astro` | Form embed |
| `vulse/client/BlockRenderer.astro` | Server-side block renderer |
| `vulse/client/BlockRenderer.vue` | Vue block renderer (for custom sets) |
| `vulse/integration/cron` | Scheduled handler for media purge and preview-session purge |
