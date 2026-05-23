# Vulse Forms — Design Spec

**Status:** Draft for review  
**Date:** 2026-05-23  
**Author:** Espen (with Claude)  
**Depends on:** [Vulse for Astro v1 Design Spec](./2026-05-23-vulseastro-design.md) (core, server, admin, integration layers)

## Vision

Vulse ships a first-party **form builder** so developers can capture leads, contact messages, and applications without wiring a third-party service. Forms are defined in the admin UI (editor UX modeled on the blueprint editor), rendered headlessly on the public site, validated server-side, stored in D1, and delivered to editors **and** notification inboxes on every submission.

Forms follow the same product philosophy as auth and blocks: **Vulse owns validation, storage, and default actions; developers own markup and optional hooks.**

---

## Decisions locked in

| # | Decision |
|---|----------|
| 1 | **Both admin and email on every submission** — every successful submit is persisted and visible in Admin → Forms → Submissions; notification email(s) are sent asynchronously for every submit (when configured). |
| 2 | **Unique constraints are per form** — e.g. `email` unique within `newsletter-signup`, not globally across all forms. |
| 3 | **TTL on draft file uploads** — files uploaded before submit but never attached to a submission are purged after a configurable TTL (default 24 h). |
| 4 | **No Turnstile in v1** — spam prevention is honeypot + basic rate limiting only. Cloudflare Turnstile is a v1.x follow-up. |

Additional defaults:

| Area | Decision |
|------|----------|
| Forms vs blueprints | Separate domain (`vulse_forms`, `vulse_form_submissions`); do not store forms as collections |
| Editor UX | Fork `BlueprintEditor` patterns into `FormEditor.vue`; share field-row components where possible |
| Public renderer | Headless `FormRenderer.astro` + optional `vulse/client/forms` browser SDK |
| Email delivery | **Never block the submit response** — enqueue outbound email; use Cloudflare Queues + Email Workers (or documented fallback) |
| File fields | Reuse R2 + `vulse_media`; tag uploads with form context and draft/submission IDs |
| Developer extensibility | Integration hooks (`onSubmit`, `onAfterProcess`) + declarative form actions (webhook, email) |
| Queue binding | Dedicated `FORM_QUEUE` in `wrangler.toml` |
| Confirmation email | Skip when `toField` unset, empty, or missing from payload; admin notify still sent |
| Submission retention | Infinite storage v1; manual delete in admin (+ bulk delete API) |

---

## 1. Goals (v1)

1. **Admin:** Create/edit forms, field list with validation, success message / redirect, notification + confirmation email templates, view/export submissions.
2. **Public:** Embed `<FormRenderer form="contact" />` with slot-based field markup (same headless pattern as `SignInForm`).
3. **Server:** Validate with compiled Zod schema, enforce per-form uniqueness, store submission, enqueue side effects, return success payload synchronously.
4. **Ops:** Cron/queue consumer sends emails and marks submission processing status; cron purges expired draft uploads.

---

## 2. Architecture

### 2.1 Layer placement

| Layer | Responsibility |
|-------|----------------|
| `core` | `FormDefinition` schema, compile to Zod, `FormsRepo`, `SubmissionsRepo`, draft-upload metadata, uniqueness checks |
| `server` | `POST /api/vulse/forms/:handle/submit`, `POST .../upload`, queue producer, email/webhook action runners |
| `admin` | `/admin/forms`, `/admin/forms/new`, `/admin/forms/:handle`, `/admin/forms/:handle/submissions` |
| `integration` | Inject routes, optional `forms` config hooks, cron handler extension for upload purge + queue drain |
| `client` | `FormRenderer.astro`, field event SDK, embed snippet generation |

Admin talks to server over HTTP only (consistent with entries/blueprints).

### 2.2 Submit path (non-blocking)

```
Browser POST /api/vulse/forms/:handle/submit
  → honeypot + rate limit (sync)
  → Zod validate payload (sync)
  → per-form unique checks (sync)
  → attach draft file IDs → finalize media rows (sync, transaction)
  → INSERT vulse_form_submissions (sync)
  → enqueue FormProcessJob { submissionId } (sync, ~ms)
  → return { ok, message | redirect } (sync)

Queue consumer (Worker / vulse/integration/cron)
  → load submission + form definition
  → run actions: notify email, confirmation email, webhooks
  → invoke integration onSubmit / onAfterProcess hooks
  → UPDATE submission.status = 'processed' | 'failed'
```

The HTTP handler **must not** await SMTP or external webhooks. Target p95 submit latency: &lt; 100 ms excluding upload size.

### 2.3 Relationship to blueprints

| Concept | Blueprints | Forms |
|---------|------------|-------|
| Source of truth | `vulse_collections.definition` (+ TS seed) | `vulse_forms.definition` |
| Editor | `BlueprintEditor.vue` | `FormEditor.vue` (shared field-row UI) |
| Runtime output | Content entries | Submissions |
| Public API | Loader / SDK | `FormRenderer` + submit API |

Field **kinds** overlap (text, select, date, file) but form kinds include layout/action types (`submit`, `hidden`, `honeypot`) and form-specific validation. Share `compile.ts` patterns, not the same discriminated union.

---

## 3. Data model

### 3.1 Migration `0004_forms.sql`

```sql
CREATE TABLE vulse_forms (
  handle TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  definition TEXT NOT NULL,          -- JSON FormDefinition
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE vulse_form_submissions (
  id TEXT PRIMARY KEY,
  form_handle TEXT NOT NULL REFERENCES vulse_forms(handle) ON DELETE CASCADE,
  payload TEXT NOT NULL,             -- JSON (field handle → value)
  file_refs TEXT NOT NULL DEFAULT '[]', -- JSON [{ field, mediaId }]
  meta TEXT NOT NULL,                -- JSON { ip, userAgent, referer, locale }
  status TEXT NOT NULL DEFAULT 'received',  -- received | processed | failed
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX vulse_form_submissions_form_created
  ON vulse_form_submissions(form_handle, created_at DESC);

CREATE TABLE vulse_form_upload_drafts (
  id TEXT PRIMARY KEY,
  form_handle TEXT NOT NULL,
  field_name TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES vulse_media(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX vulse_form_upload_drafts_expires
  ON vulse_form_upload_drafts(expires_at);

CREATE TABLE vulse_form_unique_values (
  form_handle TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value_hash TEXT NOT NULL,          -- sha256(normalized value)
  submission_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (form_handle, field_name, value_hash)
);
```

Extend `vulse_media` (or use JSON metadata column if added later) with optional `form_handle`, `submission_id`, `draft_id` for traceability. v1: store linkage in `file_refs` on submission + `vulse_form_upload_drafts`; media rows created at upload time with `uploaded_by = null` for anonymous public uploads.

### 3.2 `FormDefinition` JSON shape

```ts
interface FormDefinition {
  handle: string
  label: string
  fields: FormFieldDefinition[]      // ordered = display order
  settings: FormSettings
  actions: FormAction[]              // declarative side effects
}

interface FormSettings {
  enabled: boolean
  successMessage?: string            // shown when no redirect
  redirectTo?: string                // absolute or site-relative URL
  honeypotField?: string             // default: _hp (hidden field name)
  rateLimit?: { maxPerIp: number; windowSec: number }  // default 10 / 3600
  uploadDraftTtlHours?: number       // default 24
  notifyEmails?: string[]            // admin notification recipients
  confirmationEmail?: {
    enabled: boolean
    toField: string                  // field handle containing submitter email
    subject: string
    bodyTemplate: string             // mustache-style {{field}} tokens
  }
}

interface FormFieldDefinition {
  name: string                       // handle; JSON key in payload
  label?: string
  ui: FormFieldUi
  optional: boolean
  default?: unknown
  validation?: FormFieldValidation
}

type FormFieldUi =
  | { kind: 'text' | 'textarea' | 'email' | 'number' | 'date' | 'time' | 'datetime' }
  | { kind: 'select' | 'radio'; options: string[] }
  | { kind: 'checkbox'; label?: string }   // single boolean
  | { kind: 'file'; accept?: string[]; maxBytes?: number }
  | { kind: 'hidden'; value?: string }
  | { kind: 'honeypot' }                    // server-side only; not in public schema export
  | { kind: 'submit'; label?: string }      // layout; excluded from payload

interface FormFieldValidation {
  required?: boolean
  min?: number                         // string length or numeric min
  max?: number
  pattern?: string                     // regex string
  email?: boolean
  url?: boolean
  integer?: boolean
  unique?: boolean                     // per form; uses vulse_form_unique_values
}
```

**v1 field kinds (ship):** `text`, `textarea`, `email`, `number`, `select`, `checkbox`, `radio`, `date`, `time`, `datetime`, `file`, `hidden`, `honeypot`, `submit`.

**Deferred (v1.x):** `image`, `video`, `audio` as file presets; `link`, `button` as non-input layout blocks; conditional visibility.

### 3.3 Compiler

`core/forms/compile.ts`:

```ts
export function compileForm(def: FormDefinition): {
  schema: z.ZodObject<...>
  inputFields: FormFieldDefinition[]   // excludes submit, honeypot
  uniqueFields: string[]
}
```

- Maps each field kind to Zod (reuse patterns from `compileFieldBase` where identical).
- `file` fields validate as `z.string().min(1)` (media ID) after upload step.
- `email` + `validation.email` → `z.string().email()`.
- `unique: true` → checked in repo layer (D1 unique index), not Zod alone.

---

## 4. File uploads

### 4.1 Two-phase upload

1. **Draft upload** — `POST /api/vulse/forms/:handle/upload`  
   - Multipart `file` + `field` (must match a `file` field on the form).  
   - Validates mime/size against field config.  
   - Writes to R2, inserts `vulse_media`, inserts `vulse_form_upload_drafts` with `expires_at = now + TTL`.  
   - Returns `{ mediaId, draftId, expiresAt }`.

2. **Submit** — payload includes `{ resumeField: mediaId }` for each file field.  
   - Handler verifies each `mediaId` belongs to a non-expired draft for this form + field.  
   - Deletes draft row; links media in `file_refs`.  
   - Orphan drafts past TTL: cron hard-deletes media + R2 object.

### 4.2 TTL purge

- Default TTL: **24 hours** (`settings.uploadDraftTtlHours`).
- Cron (extend `vulseScheduled` or dedicated `vulseFormPurgeDrafts`):
  - `SELECT * FROM vulse_form_upload_drafts WHERE expires_at < now`
  - Delete R2 keys, soft/hard delete media, delete draft rows.
- Log purge counts; no admin UI required in v1.

### 4.3 Limits (v1 defaults)

| Limit | Default |
|-------|---------|
| Max file size | 10 MB per field (override per field) |
| Max files per submission | 5 |
| Allowed mime | field `accept` or `*/*` with blocklist for executables |

---

## 5. Spam prevention (v1)

| Mechanism | Behavior |
|-----------|----------|
| **Honeypot** | Hidden field (default `_hp`); any non-empty value → silently accept (200 + fake success) but **do not store** or email |
| **Rate limit** | Per IP + form handle; sliding window in D1 or KV (prefer D1 table `vulse_form_rate_limits` for v1 simplicity) |
| **Turnstile** | **Out of scope v1** — document extension point in `FormSettings.captcha` for v1.x |

Silent honeypot success prevents signal to bots that they were blocked.

---

## 6. Email & actions

### 6.1 Action types (declarative)

Stored in `FormDefinition.actions` (defaults merged at save time):

```ts
type FormAction =
  | { type: 'notify'; emails: string[]; template?: string }
  | { type: 'confirmation'; toField: string; subject: string; bodyTemplate: string }
  | { type: 'webhook'; url: string; headers?: Record<string, string> }
```

On save, admin UI populates `notify` from `settings.notifyEmails` and `confirmation` from `settings.confirmationEmail` so the queue runner has one code path.

### 6.2 Templates

Mustache-lite token replacement: `{{field_name}}`, `{{form.label}}`, `{{submission.id}}`, `{{submission.created_at}}`.

Admin provides default templates; editable per form.

### 6.3 Cloudflare Email Workers

- Queue consumer calls Email Workers send API ([Cloudflare Email Routing / Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)).
- Requires user to configure sending domain in Cloudflare dashboard (document in README).
- If email is not configured: submission still **stored**; `status = failed` with `error = 'email_not_configured'`; admin UI shows warning badge.
- **Both** notify and confirmation emails enqueue as separate jobs or sequential steps in one consumer — never inline in submit handler.

### 6.4 Webhooks

- POST JSON `{ form, submission, payload }` to configured URL.
- 5 s timeout; failures logged on submission; retry once in consumer (v1).

---

## 7. Developer hooks

### 7.1 Integration config

```ts
// astro.config.mjs
import vulse from 'vulse/integration'

export default defineConfig({
  integrations: [
    vulse({
      forms: {
        onSubmit: async ({ form, payload, submission, env, request }) => {
          // Return void, or throw to mark submission failed after persist
          // Use for CRM, Slack, custom validation
        },
        onAfterProcess: async ({ form, submission, env }) => {
          // Runs after built-in actions complete
        },
      },
    }),
  ],
})
```

Hooks run in the **queue consumer**, not the submit handler (except `onSubmit` may run pre-queue for advanced cases — v1: **consumer only** to keep submit fast).

### 7.2 Public embed

```astro
---
import FormRenderer from 'vulse/client/components/FormRenderer.astro'
---
<FormRenderer form="contact" class="contact-form">
  <input name="name" type="text" required placeholder="Your name" />
  <input name="email" type="email" required placeholder="Email" />
  <textarea name="message" required />
  <button type="submit">Send</button>
</FormRenderer>
```

- Form fetches definition from `GET /api/vulse/forms/:handle/public` (fields + settings minus secrets).
- Client script mirrors `SignInForm`: `fetch` submit, dispatch `vulse:form:success` / `vulse:form:error`.
- File fields: progressive upload on change, hidden input holds `mediaId`.

Admin **Embed** tab shows copy-paste snippet.

---

## 8. Admin UI

### 8.1 Routes

```
/admin/forms                              Form list (enabled/disabled, submission count)
/admin/forms/new                          Create form (handle + label)
/admin/forms/:handle                      Form editor (tabs)
/admin/forms/:handle/submissions          Submission list
/admin/forms/:handle/submissions/:id      Submission detail + export
```

### 8.2 Form editor tabs

| Tab | Contents |
|-----|----------|
| **Fields** | Field list (reuse blueprint editor row UX): add/remove/reorder, kind, label, validation, unique |
| **Settings** | Success message, redirect, honeypot name, rate limit, upload TTL |
| **Emails** | Notify recipients (multi), confirmation toggle + template + to-field |
| **Actions** | Webhook URL(s), optional extra actions |
| **Embed** | `FormRenderer` snippet, public API URL |

### 8.3 Submissions

- Table: date, status, preview of primary field(s), IP (truncated).
- Detail: full payload, file download links via `/api/vulse/media/:id/file`.
- Export CSV (v1): all submissions for form.
- **Manual delete:** single submission or bulk select → delete (removes row + unique index entries + optional file refs).
- **Every submission appears here** regardless of email delivery status.

---

## 9. API surface

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/vulse/forms` | admin | List forms |
| POST | `/api/vulse/forms` | admin | Create form |
| GET | `/api/vulse/forms/:handle` | admin | Get definition |
| PUT | `/api/vulse/forms/:handle` | admin | Update definition |
| DELETE | `/api/vulse/forms/:handle` | admin | Delete form + submissions |
| GET | `/api/vulse/forms/:handle/public` | none | Public schema for renderer |
| POST | `/api/vulse/forms/:handle/upload` | none | Draft file upload |
| POST | `/api/vulse/forms/:handle/submit` | none | Submit form |
| GET | `/api/vulse/forms/:handle/submissions` | admin | List submissions |
| GET | `/api/vulse/forms/:handle/submissions/:id` | admin | Get submission |
| DELETE | `/api/vulse/forms/:handle/submissions/:id` | admin | Manual delete submission |
| DELETE | `/api/vulse/forms/:handle/submissions` | admin | Bulk delete (body: `{ ids: string[] }`) |

Submit response:

```json
{ "ok": true, "message": "Thanks!", "redirect": null }
// or
{ "ok": true, "redirect": "/thanks" }
```

Errors: `{ "ok": false, "code": "VALIDATION", "issues": [...] }` (422).

---

## 10. Uniqueness (per form)

When `validation.unique: true` on a field:

1. Normalize value (trim, lowercase for email).
2. `value_hash = sha256(normalized)`.
3. On submit, `INSERT INTO vulse_form_unique_values` — conflict → 422 `{ field, message: 'Already submitted' }`.
4. On submission delete (admin): remove unique rows for that submission (v1.x bulk delete).

Scope is always `(form_handle, field_name, value_hash)`.

---

## 11. Security

- Public endpoints: no session required; CORS same-origin only.
- File upload: validate form exists and is enabled; field is `file` kind; draft scoped to form.
- Admin endpoints: existing Better Auth admin guard.
- Webhook URLs: SSRF protection — block private IP ranges, localhost (reuse `sanitizeLinkHref` patterns).
- Payload size cap: 256 KB JSON excluding files.

---

## 12. Testing strategy

| Area | Tests |
|------|-------|
| `compileForm` | Unit — each field kind + validation |
| Uniqueness | Integration — duplicate submit rejected per form, allowed across forms |
| Submit flow | Integration — honeypot silent, rate limit, validation errors |
| Draft TTL | Integration — expired draft rejected on submit; cron purge removes media |
| Queue | Integration — mock email sender; submission → processed status |
| Hooks | Unit — mock integration callbacks invoked with correct payload |

---

## 13. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **9a — Core** | Migration, repos, compile, admin CRUD API |
| **9b — Admin UI** | FormEditor, submissions list |
| **9c — Public** | FormRenderer, submit + upload endpoints |
| **9d — Async** | Queue consumer, notify + confirmation email, webhooks |
| **9e — Hooks & playground** | Integration config, contact form demo on playground |

---

## 14. Out of scope (v1)

- Turnstile / CAPTCHA (v1.x)
- Conditional field logic
- Multi-page forms / wizard
- Form analytics / A/B testing
- Payment fields
- Signed/authenticated forms (member-only submit)
- GraphQL exposure

---

## 15. Resolved decisions (formerly open questions)

| # | Decision |
|---|----------|
| 1 | **Dedicated `FORM_QUEUE` binding** in `wrangler.toml` — separate from any generic Vulse queue. |
| 2 | **Skip confirmation email** when `confirmationEmail.toField` is unset, empty, or missing from the submission payload; admin notify email still runs. |
| 3 | **Infinite submission storage** in v1 — no auto-expiry; admins may **manually delete** individual submissions (or bulk delete) from Admin → Submissions; deleting a submission removes its per-form unique index rows. |

---

## 16. README / docs additions (post-implementation)

- Cloudflare Email Workers setup checklist
- FormRenderer embed guide
- Hook examples (Slack webhook via `onSubmit`)
- File upload + TTL behavior for end users
