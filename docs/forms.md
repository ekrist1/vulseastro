# Forms

Vulse includes a first-party form builder. Define forms in **Admin → Forms**, embed them on your public site with `FormRenderer`, and view submissions in the admin under each form. Submissions are stored in D1, with optional async processing through a Cloudflare Queue.

## Embedding a form

```astro
---
import FormRenderer from '@vulsecms/core/client/components/FormRenderer.astro'
---
<FormRenderer form="contact">
  <input name="name" type="text" required />
  <input name="email" type="email" required />
  <textarea name="message" required />
  <button type="submit">Send</button>
</FormRenderer>
```

The component:

1. Looks up the form definition at build/SSR time.
2. Renders the slotted markup inside a `<form>` with the right action and method.
3. Submits as JSON to `POST /api/vulse/forms/:handle/submit`.
4. Dispatches `vulse:form:success` / `vulse:form:error` events on the form element.

You can listen for those events to swap the form for a thank-you message:

```html
<script>
  document.querySelector('form[data-vulse-form]')?.addEventListener('vulse:form:success', (e) => {
    e.target.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Thanks!' }))
  })
</script>
```

## Field types

In the admin form editor each field has a name, label, type, required flag, and optional validation hints:

| Type | Renders as | Stored as |
|------|------------|-----------|
| text | `<input type="text">` | string |
| email | `<input type="email">` | string (validated) |
| textarea | `<textarea>` | string |
| number | `<input type="number">` | number |
| boolean | `<input type="checkbox">` | boolean |
| select | `<select>` | string |
| date | `<input type="date">` | ISO string |
| file | _see [File uploads](#file-uploads)_ | media ID |

When `FormRenderer` is given a slot, you provide the markup — the field type list above is mainly used by validators on the server.

## Admin

**Forms** (`/admin/forms`)
- Create / edit field definitions.
- Configure success message, redirect, notification emails.
- Pin / archive forms.

**Submissions** (`/admin/forms/:handle/submissions`)
- List view with filter by status (`received`, `processed`, `failed`).
- Detail view with payload and metadata.
- Bulk delete.
- CSV export.

## Spam protection (v1)

- **Honeypot field** — default name `_hp`. Non-empty values get a fake success response without any storage. Add a hidden `<input name="_hp">` styled off-screen.
- **Per-IP rate limiting** — default 10 submissions per hour per form, keyed by hashed IP. Configurable per form.
- **Per-form unique fields** — declare `email` (or any other field) as `unique` to prevent duplicate signups.

The honeypot and rate limiting are always on.

## File uploads

Uploads happen in two phases so the submit endpoint stays small and JSON.

1. The browser `POST`s `multipart/form-data` to `/api/vulse/forms/:handle/upload` with fields `file` and `field` (the form field name). The endpoint returns `{ ok: true, data: { mediaId } }`.
2. The browser includes that `mediaId` in the JSON submit payload under the same field name.

`FormRenderer` handles this for `<input type="file">` slot inputs automatically.

Files land in R2 as a regular media record. They are kept under a "draft" expiry — if the user never completes the submit, the scheduled cron handler purges orphan drafts after a few hours (see [`deployment.md#cron`](deployment.md#cron)).

## Async processing (`FORM_QUEUE`)

The submit handler returns immediately. Notification emails, webhooks, and queued plugin hooks run in a Cloudflare Queue consumer.

Add the queue to `wrangler.toml`:

```toml
[[queues.producers]]
queue = "vulse-form-queue"
binding = "FORM_QUEUE"

[[queues.consumers]]
queue = "vulse-form-queue"
max_batch_size = 10
max_batch_timeout = 30
```

Export the consumer from your worker entry:

```ts
// src/worker.ts (or wherever your worker entry is)
import { vulseFormQueue } from '@vulsecms/core/server'

export default {
  async queue(batch, env) {
    await vulseFormQueue(batch, env)
  },
}
```

Without a `FORM_QUEUE` binding, submissions are still stored in D1 — but the async side-effects don't run automatically. You can re-process manually by reading rows from `vulse_form_submissions` (e.g. in a one-off worker, or your own cron).

## Plugin hooks

Use the plugin system in [`plugins.md`](plugins.md) for custom form behavior.
`form:beforeSubmit` can reject or silently drop spam before the submission is
stored. `form:beforeProcess` and `form:afterProcess` run inside the queue
consumer and have access to `env` (D1, R2, secrets) via the hook context.

## REST endpoints

The full list is in [`api-reference.md#forms`](api-reference.md#forms). Highlights:

```txt
POST   /api/vulse/forms/:handle/submit       public — submits a form
POST   /api/vulse/forms/:handle/upload       public — uploads a file (multipart)
GET    /api/vulse/forms/:handle/public       public — form schema for client-side validation
GET    /api/vulse/forms                      admin — list forms
GET    /api/vulse/forms/:handle              admin — form + submissions
DELETE /api/vulse/forms/:handle/submissions/:id   admin — delete one submission
```

## Common patterns

### Newsletter signup

```astro
<FormRenderer form="newsletter">
  <input name="_hp" type="text" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" />
  <input name="email" type="email" required placeholder="you@example.com" />
  <button type="submit">Subscribe</button>
</FormRenderer>
```

Set `email` as a **unique** field in the form editor to block duplicates.

### Contact form with file attachment

```astro
<FormRenderer form="contact" enctype="multipart/form-data">
  <input name="name" type="text" required />
  <input name="email" type="email" required />
  <textarea name="message" required />
  <input name="attachment" type="file" />
  <button type="submit">Send</button>
</FormRenderer>
```

The renderer uploads the file first, then submits the JSON with the resulting media ID.

### Webhook integration

```ts
// astro.config.mjs
import { definePlugin } from '@vulsecms/core'

vulse({
  plugins: [
    definePlugin({
      id: 'contact-webhook',
      hooks: {
        'form:beforeProcess': async ({ form, submission }) => {
          if (form.handle !== 'contact') return
          await fetch('https://hooks.example.com/contact', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(submission.payload),
          })
        },
      },
    }),
  ],
})
```

For Slack:

```ts
definePlugin({
  id: 'slack-form-notify',
  hooks: {
    'form:beforeProcess': async ({ form, submission }, ctx) => {
      if (typeof ctx.env.SLACK_WEBHOOK !== 'string') return
      await fetch(ctx.env.SLACK_WEBHOOK, {
        method: 'POST',
        body: JSON.stringify({ text: `New ${form.label}: ${submission.payload.email}` }),
      })
    },
  },
})
```
