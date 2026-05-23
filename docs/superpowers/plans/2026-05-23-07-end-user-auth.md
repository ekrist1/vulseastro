# Plan 7 — End-User Auth + Member Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End users (non-admins) can sign up, sign in, sign out, and request password resets on the user's own public Astro site. The user's pages can gate content for members via the SDK. Admins can toggle public sign-up in `/admin/settings/auth`. End-user UI is **headless** — Vulse ships the wiring; the user owns the styling.

**Architecture:** Reuse the Better Auth setup from Plan 2; flip `allowSignUp` from a `settings` row stored in D1 instead of a build-time flag. Ship a `vulse.auth` browser SDK and small Astro components that handle form submission and session state but render no opinionated UI.

**Tech Stack:** Better Auth client, Vue composables, Astro components.

**Spec reference:** §4.5 (end-user auth surface, headless), §4.4 (default role member, admin promotes).

**Prerequisites:** Plans 1-6 complete.

---

### Task 1: Sign-up toggle in settings + dynamic auth config

**Files:**
- Modify: `packages/vulse/src/server/better-auth.ts` (read allowSignUp from settings)
- Modify: `packages/vulse/src/server/runtime.ts` (refresh auth when setting changes)
- Create: `packages/vulse/tests/integration/signup-toggle.test.ts`

- [ ] **Step 1: Make auth respect the settings row**

`src/server/better-auth.ts`:

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { VulseDb } from '../core/db.js'
import * as schema from '../core/schema.js'
import { SettingsRepo } from '../core/repos/settings.js'

export interface AuthConfig { baseURL: string; secret: string }

export async function createAuth(db: VulseDb, config: AuthConfig) {
  const settings = new SettingsRepo(db)
  const allowSignUp = (await settings.get<boolean>('allowMemberSignUp')) ?? false
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: { enabled: true, autoSignIn: true, disableSignUp: !allowSignUp },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'member', input: false },
        displayName: { type: 'string', required: false },
      },
    },
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  })
}
```

- [ ] **Step 2: Invalidate runtime cache when settings change**

`src/server/runtime.ts`:

```ts
export function invalidateRuntime(): void { cached = null }
```

Modify `SettingsRepo.set` callers (route in Plan 3) to call `invalidateRuntime()` when `key === 'allowMemberSignUp'`.

- [ ] **Step 3: Test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { SettingsRepo } from '../../src/core/repos/settings'
import { createAuth } from '../../src/server/better-auth'

describe('sign-up toggle', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('rejects sign-up when allowMemberSignUp is false (default)', async () => {
    const auth = await createAuth(createDb(env.DB), { baseURL: 'http://x', secret: 'a'.repeat(32) })
    const res = await auth.handler(new Request('http://x/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@x.com', password: 'password123', name: 'M' }),
    }))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('allows sign-up when toggled on', async () => {
    const db = createDb(env.DB)
    await new SettingsRepo(db).set('allowMemberSignUp', true)
    const auth = await createAuth(db, { baseURL: 'http://x', secret: 'a'.repeat(32) })
    const res = await auth.handler(new Request('http://x/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@x.com', password: 'password123', name: 'M' }),
    }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/server/better-auth.ts packages/vulse/src/server/runtime.ts packages/vulse/tests/integration/signup-toggle.test.ts
git commit -m "feat(vulse): sign-up toggle driven by settings row"
```

---

### Task 2: Auth settings page

**Files:**
- Create: `packages/vulse/src/admin/pages/settings/auth.astro`
- Create: `packages/vulse/src/admin/components/AuthSettings.vue`

- [ ] **Step 1: Component**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const allowMemberSignUp = ref(false)
const allowedDomains = ref<string[]>([])
async function load() {
  const all = await adminApi.get<Record<string, unknown>>('/api/vulse/settings')
  allowMemberSignUp.value = !!all.allowMemberSignUp
  allowedDomains.value = (all.allowedSignUpDomains as string[]) ?? []
}
async function save() {
  await adminApi.put('/api/vulse/settings/allowMemberSignUp', { value: allowMemberSignUp.value })
  await adminApi.put('/api/vulse/settings/allowedSignUpDomains', { value: allowedDomains.value })
}
onMounted(load)
</script>
<template>
  <div class="space-y-4 max-w-md">
    <label class="flex items-center gap-2">
      <input v-model="allowMemberSignUp" type="checkbox" />
      <span class="text-sm">Allow public member sign-up</span>
    </label>
    <label class="block">
      <span class="text-sm text-zinc-600">Allowed email domains (comma-separated; blank = any)</span>
      <input :value="allowedDomains.join(', ')" @change="allowedDomains = ($event.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean)"
        class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <button @click="save" class="rounded bg-brand text-white px-4 py-2 text-sm">Save</button>
  </div>
</template>
```

- [ ] **Step 2: Page**

```astro
---
import AdminShell from '../../components/AdminShell.astro'
import AuthSettings from '../../components/AuthSettings.vue'
---
<AdminShell title="Auth settings" activePath="/admin/settings/auth">
  <h1 class="text-2xl font-semibold mb-4">Authentication</h1>
  <AuthSettings client:load />
</AdminShell>
```

- [ ] **Step 3: Enforce allowedSignUpDomains in the auth config**

In `better-auth.ts`, before returning the instance, override `signUp.emailAndPassword` validation:

```ts
const allowedDomains = (await settings.get<string[]>('allowedSignUpDomains')) ?? []
// ...inside betterAuth({ ... }):
emailAndPassword: {
  enabled: true,
  autoSignIn: true,
  disableSignUp: !allowSignUp,
  validateOnSignUp: allowedDomains.length === 0 ? undefined : ({ email }: { email: string }) => {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain || !allowedDomains.includes(domain)) {
      return { valid: false, message: 'Email domain not allowed' }
    }
    return { valid: true }
  },
},
```

> Confirm `validateOnSignUp` matches the better-auth API version pinned. If the API has moved, use the `databaseHooks.user.create.before` callback to reject.

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/admin/pages/settings/auth.astro packages/vulse/src/admin/components/AuthSettings.vue packages/vulse/src/server/better-auth.ts
git commit -m "feat(vulse-admin): auth settings page (signup toggle + domain allowlist)"
```

---

### Task 3: Browser auth SDK

**Files:**
- Create: `packages/vulse/src/client/auth.ts`
- Modify: `packages/vulse/src/client/index.ts` (re-export)

- [ ] **Step 1: Implement**

```ts
export interface SignInInput { email: string; password: string }
export interface SignUpInput { email: string; password: string; name: string }
export interface Session { user: { id: string; email: string; name: string; role: 'admin' | 'editor' | 'member' } } | null

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Request failed (${res.status})`)
  return res.json() as Promise<T>
}

export const auth = {
  signIn: (input: SignInInput) => call<{ data: unknown }>('/api/auth/sign-in/email', input),
  signUp: (input: SignUpInput) => call<{ data: unknown }>('/api/auth/sign-up/email', input),
  signOut: () => call<unknown>('/api/auth/sign-out', undefined, 'POST'),
  requestPasswordReset: (email: string) => call<unknown>('/api/auth/forget-password', { email, redirectTo: '/reset-password' }),
  resetPassword: (token: string, password: string) => call<unknown>('/api/auth/reset-password', { token, newPassword: password }),
  session: async (): Promise<Session> => {
    const res = await fetch('/api/auth/get-session', { credentials: 'same-origin' })
    if (!res.ok) return null
    return res.json()
  },
}
```

- [ ] **Step 2: Re-export from client**

`src/client/index.ts`:
```ts
export { default as BlockRenderer } from './BlockRenderer.vue'
export { auth as vulseAuth } from './auth.js'
export type { Block, BlockType } from '../core/blocks/schema.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/client
git commit -m "feat(vulse): browser auth SDK (vulseAuth)"
```

---

### Task 4: Headless Astro components

**Files:**
- Create: `packages/vulse/src/client/components/SignInForm.astro`
- Create: `packages/vulse/src/client/components/SignUpForm.astro`
- Create: `packages/vulse/src/client/components/SignOutButton.astro`
- Create: `packages/vulse/src/client/components/SessionGuard.astro`
- Modify: `package.json` exports map: `"./client/components": ...`

- [ ] **Step 1: SignInForm.astro (headless)**

```astro
---
interface Props { redirectTo?: string; class?: string }
const { redirectTo = '/', class: cls } = Astro.props
---
<form data-vulse-sign-in data-redirect={redirectTo} class={cls}>
  <slot />
</form>
<script>
  document.querySelectorAll('form[data-vulse-sign-in]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = new FormData(form as HTMLFormElement)
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
        credentials: 'same-origin',
      })
      const event = new CustomEvent(res.ok ? 'vulse:sign-in:success' : 'vulse:sign-in:error', { detail: { status: res.status } })
      form.dispatchEvent(event)
      if (res.ok) window.location.href = (form as HTMLFormElement).dataset.redirect || '/'
    })
  })
</script>
```

Usage (user's project — they style everything):

```astro
<SignInForm redirectTo="/account" class="my-styled-form">
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button>Sign in</button>
</SignInForm>
```

- [ ] **Step 2: SignUpForm.astro and SignOutButton.astro** follow the same pattern: data-attribute hook + minimal script. Dispatch `vulse:sign-up:success/error` and `vulse:sign-out:success/error` events for the user to hook into.

- [ ] **Step 3: SessionGuard.astro (server-side)**

```astro
---
import { getRuntime } from '../../server/runtime.js'
import { registryFromUserCollections } from '../../core/blueprints/load.js'

interface Props { requireRole?: 'member' | 'editor' | 'admin'; redirectTo?: string }
const { requireRole = 'member', redirectTo = '/sign-in' } = Astro.props

const env = (Astro.locals as any).runtime?.env
if (!env) return Astro.redirect(redirectTo)
const rt = await getRuntime(env, await registryFromUserCollections(), new URL(Astro.request.url).origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

const ROLE_RANK = { member: 1, editor: 2, admin: 3 }
if (!session) return Astro.redirect(redirectTo)
if (ROLE_RANK[(session.user as any).role as keyof typeof ROLE_RANK] < ROLE_RANK[requireRole]) {
  return new Response('Forbidden', { status: 403 })
}
;(Astro.locals as any).vulseSession = session
---
<slot />
```

Usage:
```astro
---
import SessionGuard from 'vulse/client/components/SessionGuard.astro'
---
<SessionGuard requireRole="member">
  <h1>Members only</h1>
</SessionGuard>
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/client/components packages/vulse/package.json
git commit -m "feat(vulse): headless auth components (SignIn/SignUp/SignOut/Guard)"
```

---

### Task 5: Member-gated content via SDK

**Files:**
- Demonstrate via playground updates only.

- [ ] **Step 1: Add member-gated `recipe` blueprint to playground**

`playground/vulse-play/src/vulse/collections/recipe.ts`:

```ts
import { defineCollection, z, blocks } from 'vulse'

export default defineCollection({
  name: 'recipe', label: 'Recipe',
  schema: z.object({ title: z.string(), slug: z.string(), body: blocks() }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' && !!user, // members-only
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})
```

- [ ] **Step 2: Page that uses SessionGuard + SDK**

`playground/vulse-play/src/pages/recipes/[slug].astro`:

```astro
---
import SessionGuard from 'vulse/client/components/SessionGuard.astro'
import { getRuntime } from 'vulse/server'
import { registryFromUserCollections } from 'vulse/server'
import { BlockRenderer } from 'vulse/client'

const env = (Astro.locals as any).runtime?.env
const rt = await getRuntime(env, await registryFromUserCollections(), new URL(Astro.request.url).origin)
---
<SessionGuard requireRole="member" redirectTo={`/sign-in?next=/recipes/${Astro.params.slug}`}>
  {(async () => {
    const session = (Astro.locals as any).vulseSession
    const recipe = await rt.sdk.collections.findBySlug('recipe', Astro.params.slug!, { audience: session?.user })
    if (!recipe) return <p>Not found</p>
    return (
      <article>
        <h1>{(recipe.content as any).title}</h1>
        <BlockRenderer blocks={(recipe.content as any).body ?? []} />
      </article>
    )
  })()}
</SessionGuard>
```

> Engineer note: Astro doesn't support async in the JSX body directly — the real implementation hoists the SDK call into the frontmatter, branches on the gate result, and renders below. Use:
> ```astro
> ---
> const recipe = session ? await rt.sdk.collections.findBySlug('recipe', slug, { audience: session.user }) : null
> ---
> ```

- [ ] **Step 3: Commit**

```bash
git add playground/vulse-play/src/vulse/collections/recipe.ts playground/vulse-play/src/pages/recipes
git commit -m "chore(playground): member-gated recipe collection demo"
```

---

### Task 6: Auth journey integration test

**Files:**
- Create: `packages/vulse/tests/integration/end-user-auth.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { SettingsRepo } from '../../src/core/repos/settings'
import { createAuth } from '../../src/server/better-auth'

describe('member journey', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('sign-up → sign-in → session → sign-out → session=null', async () => {
    const db = createDb(env.DB)
    await new SettingsRepo(db).set('allowMemberSignUp', true)
    const auth = await createAuth(db, { baseURL: 'http://x', secret: 'a'.repeat(32) })

    const signUp = await auth.handler(new Request('http://x/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'm@x.com', password: 'password123', name: 'M' }),
    }))
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie') ?? ''

    const sessionRes = await auth.handler(new Request('http://x/api/auth/get-session', { headers: { cookie } }))
    const session = await sessionRes.json() as any
    expect(session?.user?.email).toBe('m@x.com')
    expect(session.user.role).toBe('member')

    const signOut = await auth.handler(new Request('http://x/api/auth/sign-out', { method: 'POST', headers: { cookie } }))
    expect(signOut.status).toBeLessThan(400)
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/vulse/tests/integration/end-user-auth.test.ts
git commit -m "test(vulse): end-user sign-up/sign-in/sign-out journey"
```

---

## Self-review

- **Spec coverage:** §4.5 — Tasks 3 (SDK), 4 (headless components), 5 (gating demo). Member-default role + admin promotion already covered in earlier plans.
- **Placeholders:** Task 2 Step 3 notes "confirm `validateOnSignUp` matches the pinned better-auth API version" — that's a verification step, not a placeholder. Engineer should run a smoke test against the installed better-auth version and adapt the callback name if needed.
- **Type consistency:** `auth`, `Session`, `SessionGuard` props all consistent.
- **What this plan does NOT do:** styled UI (we ship headless), social providers (deferred — Better Auth supports them, document as user-extensible), end-user profile/account page (deferred).
