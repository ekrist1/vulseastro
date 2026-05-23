# Plan 3 — Admin UI Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browsable admin UI at `/admin`: login, dashboard, collection list, entry list/create/edit (text/enum/date/bool/number/ref/object/repeater fields — no blocks or media yet), users, settings. After this plan an admin can manage simple structured content end-to-end in a browser.

**Architecture:** Astro pages under `src/admin/pages/` injected as routes by the integration. Interactive screens are Vue islands. Field-renderer components are pure Vue, driven by a single `form-from-zod.ts` reflector. Tailwind CSS 4 for styling. Admin pages call `/api/vulse/*` via a small fetch wrapper that handles the envelope.

**Tech Stack:** Astro 6, Vue 3, Tailwind CSS 4, `@astrojs/vue`, `@astrojs/tailwind` (or v4 vite plugin), Zod for runtime introspection.

**Spec reference:** §4.1 (route map), §4.2 (form table), §4.4 (access UI affordances).

**Prerequisites:** Plans 1, 2 complete.

---

### Task 1: Vue + Tailwind integration

**Files:**
- Modify: `packages/vulse/package.json` (add `@astrojs/vue`, `vue`, `tailwindcss@4`, `@tailwindcss/vite`)
- Create: `packages/vulse/src/admin/styles/admin.css`
- Modify: `packages/vulse/src/integration/index.ts`

- [ ] **Step 1: Install**

```bash
pnpm --filter vulse add @astrojs/vue vue
pnpm --filter vulse add -D tailwindcss@^4 @tailwindcss/vite
```

- [ ] **Step 2: Update integration to register Vue + Tailwind**

```ts
import type { AstroIntegration } from 'astro'
import vue from '@astrojs/vue'
import tailwind from '@tailwindcss/vite'
import { injectVulseRoutes } from './inject-routes.js'

export default function vulse(): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': ({ injectRoute, logger, updateConfig, addRenderer }) => {
        updateConfig({ vite: { plugins: [tailwind()] }, integrations: [vue()] })
        injectVulseRoutes({ injectRoute, logger })
      },
    },
  }
}
```

- [ ] **Step 3: Create admin stylesheet**

`src/admin/styles/admin.css`:

```css
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.65 0.18 264);
}

.vulse-admin {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 4: Smoke-test in playground**

```bash
pnpm --filter growing-gravity dev
# Verify console: vue + tailwind plugins registered, no errors.
```

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/package.json packages/vulse/src/admin/styles packages/vulse/src/integration/index.ts pnpm-lock.yaml
git commit -m "feat(vulse): vue + tailwind 4 for admin"
```

---

### Task 2: Admin shell layout

**Files:**
- Create: `packages/vulse/src/admin/components/AdminShell.astro`
- Create: `packages/vulse/src/admin/components/SideNav.vue`

- [ ] **Step 1: Shell**

```astro
---
// AdminShell.astro
import '../styles/admin.css'
import SideNav from './SideNav.vue'
import { registryFromUserCollections } from '../../core/blueprints/load.js'

interface Props { title: string; activePath?: string }
const { title, activePath } = Astro.props
const registry = await registryFromUserCollections()
const collections = registry.list().map((b) => ({ name: b.name, label: b.label }))
---
<!doctype html>
<html lang="en" class="vulse-admin">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title} — Vulse</title>
  </head>
  <body class="min-h-screen bg-zinc-50 text-zinc-900">
    <div class="flex">
      <SideNav client:load collections={collections} activePath={activePath} />
      <main class="flex-1 p-8 max-w-6xl"><slot /></main>
    </div>
  </body>
</html>
```

- [ ] **Step 2: SideNav.vue**

```vue
<script setup lang="ts">
defineProps<{
  collections: { name: string; label: string }[]
  activePath?: string
}>()
</script>

<template>
  <nav class="w-60 min-h-screen border-r bg-white p-4 space-y-1 text-sm">
    <div class="text-xl font-semibold mb-6">Vulse</div>
    <a href="/admin" class="block px-3 py-2 rounded hover:bg-zinc-100" :class="activePath === '/admin' && 'bg-zinc-100 font-medium'">Dashboard</a>
    <div class="pt-4 pb-1 text-xs uppercase text-zinc-500">Content</div>
    <a v-for="c in collections" :key="c.name"
       :href="`/admin/collections/${c.name}`"
       class="block px-3 py-2 rounded hover:bg-zinc-100"
       :class="activePath?.startsWith(`/admin/collections/${c.name}`) && 'bg-zinc-100 font-medium'">
      {{ c.label }}
    </a>
    <div class="pt-4 pb-1 text-xs uppercase text-zinc-500">System</div>
    <a href="/admin/media" class="block px-3 py-2 rounded hover:bg-zinc-100">Media</a>
    <a href="/admin/users" class="block px-3 py-2 rounded hover:bg-zinc-100">Users</a>
    <a href="/admin/settings" class="block px-3 py-2 rounded hover:bg-zinc-100">Settings</a>
  </nav>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/admin/components/AdminShell.astro packages/vulse/src/admin/components/SideNav.vue
git commit -m "feat(vulse-admin): shell layout + side nav"
```

---

### Task 3: Auth-guard middleware

**Files:**
- Create: `packages/vulse/src/integration/middleware.ts`
- Modify: `packages/vulse/src/integration/index.ts` (call `addMiddleware`)

- [ ] **Step 1: Implement**

```ts
import { defineMiddleware } from 'astro:middleware'
import { getRuntime } from '../server/runtime.js'
import { registryFromUserCollections } from '../core/blueprints/load.js'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = new URL(ctx.request.url).pathname
  if (!path.startsWith('/admin') || path === '/admin/login') return next()

  const env = (ctx.locals as any).runtime?.env
  if (!env) return next()
  const rt = await getRuntime(env, await registryFromUserCollections(), new URL(ctx.request.url).origin)
  const session = await rt.auth.api.getSession({ headers: ctx.request.headers })
  if (!session) return ctx.redirect(`/admin/login?next=${encodeURIComponent(path)}`)
  ;(ctx.locals as any).vulseUser = session.user
  if (session.user.role !== 'admin' && session.user.role !== 'editor') {
    return new Response('Forbidden', { status: 403 })
  }
  return next()
})
```

- [ ] **Step 2: Register middleware**

In `integration/index.ts`, add to `astro:config:setup`:

```ts
addMiddleware({ entrypoint: new URL('./middleware.ts', import.meta.url).pathname, order: 'pre' })
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/integration/middleware.ts packages/vulse/src/integration/index.ts
git commit -m "feat(vulse): admin auth-guard middleware"
```

---

### Task 4: Login page

**Files:**
- Create: `packages/vulse/src/admin/pages/login.astro`
- Create: `packages/vulse/src/admin/components/LoginForm.vue`

- [ ] **Step 1: Page**

```astro
---
import LoginForm from '../components/LoginForm.vue'
const next = new URL(Astro.request.url).searchParams.get('next') ?? '/admin'
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" /><title>Sign in — Vulse</title>
    <link rel="stylesheet" href="/_vulse-admin.css" />
  </head>
  <body class="min-h-screen grid place-items-center bg-zinc-50 vulse-admin">
    <LoginForm client:load next={next} />
  </body>
</html>
```

- [ ] **Step 2: LoginForm.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ next: string }>()
const email = ref(''); const password = ref(''); const error = ref<string | null>(null); const loading = ref(false)
async function submit(e: Event) {
  e.preventDefault(); loading.value = true; error.value = null
  const res = await fetch('/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.value, password: password.value }),
  })
  loading.value = false
  if (!res.ok) { error.value = 'Invalid email or password'; return }
  window.location.href = props.next
}
</script>

<template>
  <form @submit="submit" class="w-80 p-6 rounded-xl shadow-sm border bg-white space-y-4">
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <label class="block">
      <span class="text-sm text-zinc-600">Email</span>
      <input v-model="email" type="email" required class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <label class="block">
      <span class="text-sm text-zinc-600">Password</span>
      <input v-model="password" type="password" required class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <button :disabled="loading" class="w-full rounded bg-brand py-2 text-white font-medium disabled:opacity-50">
      {{ loading ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
```

- [ ] **Step 3: Manual smoke test**

Run playground; navigate to `/admin/login`; sign in with the admin from Plan 2 Task 14; verify redirect to `/admin`.

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/admin/pages/login.astro packages/vulse/src/admin/components/LoginForm.vue
git commit -m "feat(vulse-admin): login page"
```

---

### Task 5: Dashboard page

**Files:**
- Create: `packages/vulse/src/admin/pages/index.astro`

- [ ] **Step 1: Page**

```astro
---
import AdminShell from '../components/AdminShell.astro'
import { getRuntime } from '../../server/runtime.js'
import { registryFromUserCollections } from '../../core/blueprints/load.js'

const env = (Astro.locals as any).runtime?.env
const rt = await getRuntime(env, await registryFromUserCollections(), new URL(Astro.request.url).origin)
const reg = rt.registry

// counts per collection
const counts: { name: string; label: string; total: number; published: number }[] = []
for (const bp of reg.list()) {
  const all = await rt.routes.entries.list(new Request(Astro.request.url), { collection: bp.name })
  // We call the route directly, but for counts the SDK approach is cleaner — Plan 6 introduces it.
  const body = await all.json() as { ok: true; data: any[] } | { ok: false }
  const list = body.ok ? body.data : []
  counts.push({
    name: bp.name, label: bp.label,
    total: list.length,
    published: list.filter((e: any) => e.status === 'published').length,
  })
}
---
<AdminShell title="Dashboard" activePath="/admin">
  <h1 class="text-2xl font-semibold mb-6">Dashboard</h1>
  <div class="grid grid-cols-3 gap-4">
    {counts.map((c) => (
      <a href={`/admin/collections/${c.name}`} class="block p-4 rounded-xl border bg-white hover:shadow-sm">
        <div class="text-sm text-zinc-500">{c.label}</div>
        <div class="text-3xl font-semibold mt-1">{c.total}</div>
        <div class="text-xs text-zinc-400 mt-1">{c.published} published</div>
      </a>
    ))}
  </div>
</AdminShell>
```

- [ ] **Step 2: Commit**

```bash
git add packages/vulse/src/admin/pages/index.astro
git commit -m "feat(vulse-admin): dashboard with per-collection counts"
```

---

### Task 6: Admin API client

**Files:**
- Create: `packages/vulse/src/admin/client/api.ts`
- Create: `packages/vulse/tests/unit/api-client.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { adminApi } from '../../src/admin/client/api'

describe('adminApi', () => {
  it('unwraps ok envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { id: 1 } }))))
    const r = await adminApi.get('/api/x')
    expect(r).toEqual({ id: 1 })
  })

  it('throws on fail envelope with code and message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: { code: 'VALIDATION', message: 'bad', details: { field: 'x' } } }),
      { status: 422 },
    )))
    await expect(adminApi.get('/api/x')).rejects.toMatchObject({ code: 'VALIDATION', message: 'bad', details: { field: 'x' } })
  })
})
```

- [ ] **Step 2: Implement**

```ts
export class AdminApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown, public status?: number) {
    super(message); this.name = 'AdminApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const body = await res.json() as { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }
  if (body.ok) return body.data
  throw new AdminApiError(body.error.code, body.error.message, body.error.details, res.status)
}

export const adminApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/admin/client/api.ts packages/vulse/tests/unit/api-client.test.ts
git commit -m "feat(vulse-admin): API client with envelope unwrapping"
```

---

### Task 7: Form-from-Zod reflector

**Files:**
- Create: `packages/vulse/src/admin/client/form-from-zod.ts`
- Create: `packages/vulse/tests/unit/form-from-zod.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'astro/zod'
import { reflectFields } from '../../src/admin/client/form-from-zod'

describe('reflectFields', () => {
  it('returns one descriptor per shape entry', () => {
    const fields = reflectFields(z.object({ title: z.string(), n: z.number(), b: z.boolean() }))
    expect(fields.map((f) => f.path)).toEqual(['title', 'n', 'b'])
    expect(fields.map((f) => f.widget)).toEqual(['text', 'number', 'bool'])
  })

  it('detects enum', () => {
    const fields = reflectFields(z.object({ status: z.enum(['draft', 'published']) }))
    expect(fields[0].widget).toBe('enum')
    expect(fields[0].options).toEqual(['draft', 'published'])
  })

  it('detects date', () => {
    const fields = reflectFields(z.object({ at: z.date() }))
    expect(fields[0].widget).toBe('date')
  })

  it('detects media via .describe(vulse:media)', () => {
    const fields = reflectFields(z.object({ img: z.string().describe('vulse:media') }))
    expect(fields[0].widget).toBe('media')
  })

  it('detects ref via .describe(vulse:ref:user)', () => {
    const fields = reflectFields(z.object({ author: z.string().describe('vulse:ref:user') }))
    expect(fields[0].widget).toBe('ref')
    expect(fields[0].refTarget).toBe('user')
  })

  it('uses textarea for long strings', () => {
    const fields = reflectFields(z.object({ body: z.string().max(2000) }))
    expect(fields[0].widget).toBe('textarea')
  })

  it('supports nested objects (recursive)', () => {
    const fields = reflectFields(z.object({ meta: z.object({ slug: z.string() }) }))
    expect(fields[0].widget).toBe('object')
    expect(fields[0].children?.[0].path).toBe('slug')
  })

  it('supports repeaters', () => {
    const fields = reflectFields(z.object({ items: z.array(z.object({ label: z.string() })) }))
    expect(fields[0].widget).toBe('repeater')
    expect(fields[0].itemFields?.[0].path).toBe('label')
  })
})
```

- [ ] **Step 2: Implement**

```ts
import { z, type ZodTypeAny } from 'astro/zod'

export type Widget = 'text' | 'textarea' | 'number' | 'bool' | 'date' | 'enum' | 'ref' | 'media' | 'blocks' | 'object' | 'repeater'

export interface FieldDescriptor {
  path: string
  widget: Widget
  required: boolean
  description?: string
  options?: string[]
  refTarget?: string
  children?: FieldDescriptor[]
  itemFields?: FieldDescriptor[]
}

export function reflectFields(schema: z.ZodObject<any>): FieldDescriptor[] {
  const shape = schema.shape as Record<string, ZodTypeAny>
  return Object.entries(shape).map(([path, sch]) => describe(path, sch))
}

function describe(path: string, sch: ZodTypeAny): FieldDescriptor {
  const def: any = sch._def
  const tag = (sch.description ?? '') as string
  const required = !sch.isOptional()

  if (tag === 'vulse:media') return { path, widget: 'media', required }
  if (tag.startsWith('vulse:ref:')) return { path, widget: 'ref', required, refTarget: tag.slice('vulse:ref:'.length) }

  // Unwrap optional / default
  let inner = sch
  while (inner._def?.typeName === 'ZodOptional' || inner._def?.typeName === 'ZodDefault') {
    inner = (inner._def as any).innerType
  }
  const t = inner._def?.typeName

  if (t === 'ZodString') {
    const max = (inner._def.checks ?? []).find((c: any) => c.kind === 'max')?.value as number | undefined
    return { path, widget: max && max > 200 ? 'textarea' : 'text', required }
  }
  if (t === 'ZodNumber') return { path, widget: 'number', required }
  if (t === 'ZodBoolean') return { path, widget: 'bool', required }
  if (t === 'ZodDate') return { path, widget: 'date', required }
  if (t === 'ZodEnum') return { path, widget: 'enum', required, options: (inner._def as any).values }
  if (t === 'ZodObject') return { path, widget: 'object', required, children: reflectFields(inner as z.ZodObject<any>) }
  if (t === 'ZodArray') {
    const el = (inner._def as any).type
    if (el._def?.typeName === 'ZodObject') return { path, widget: 'repeater', required, itemFields: reflectFields(el) }
    if (el.description === 'vulse:blocks' || path === 'body') return { path, widget: 'blocks', required }
    return { path, widget: 'text', required } // fallback for primitive arrays
  }
  return { path, widget: 'text', required }
}
```

- [ ] **Step 3: Run, commit**

```bash
git add packages/vulse/src/admin/client/form-from-zod.ts packages/vulse/tests/unit/form-from-zod.test.ts
git commit -m "feat(vulse-admin): zod schema reflection for form rendering"
```

---

### Task 8: Field renderer components

**Files:**
- Create: `packages/vulse/src/admin/components/fields/TextField.vue`
- Create: `packages/vulse/src/admin/components/fields/TextareaField.vue`
- Create: `packages/vulse/src/admin/components/fields/NumberField.vue`
- Create: `packages/vulse/src/admin/components/fields/BoolField.vue`
- Create: `packages/vulse/src/admin/components/fields/DateField.vue`
- Create: `packages/vulse/src/admin/components/fields/EnumField.vue`
- Create: `packages/vulse/src/admin/components/fields/ObjectField.vue`
- Create: `packages/vulse/src/admin/components/fields/RepeaterField.vue`
- Create: `packages/vulse/src/admin/components/fields/RefField.vue`
- Create: `packages/vulse/src/admin/components/fields/MediaField.vue` (stub — real impl Plan 5)
- Create: `packages/vulse/src/admin/components/fields/BlocksField.vue` (stub — Plan 4)
- Create: `packages/vulse/src/admin/components/fields/FieldRenderer.vue`

- [ ] **Step 1: TextField, NumberField, BoolField, DateField, EnumField (simple)**

`TextField.vue`:

```vue
<script setup lang="ts">
defineProps<{ modelValue: string; label: string; required?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}<span v-if="required" class="text-red-600">*</span></span>
    <input :value="modelValue" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      class="mt-1 w-full rounded border px-3 py-2" />
  </label>
</template>
```

(NumberField uses `type="number"` and emits Number; BoolField is a checkbox toggle; DateField uses `<input type="datetime-local">` and converts to/from ISO; EnumField is a `<select>` populated by `options` prop.)

- [ ] **Step 2: TextareaField**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string; label: string; required?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <textarea :value="modelValue" @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      rows="6" class="mt-1 w-full rounded border px-3 py-2"></textarea>
  </label>
</template>
```

- [ ] **Step 3: ObjectField (recursive)**

```vue
<script setup lang="ts">
import type { FieldDescriptor } from '../../client/form-from-zod'
import FieldRenderer from './FieldRenderer.vue'
defineProps<{ modelValue: Record<string, unknown>; label: string; fields: FieldDescriptor[] }>()
defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>): void }>()
function set(path: string, v: unknown, current: Record<string, unknown>, emit: any) {
  emit('update:modelValue', { ...current, [path]: v })
}
</script>
<template>
  <fieldset class="border rounded p-4 space-y-3">
    <legend class="text-sm font-medium px-2">{{ label }}</legend>
    <FieldRenderer v-for="f in fields" :key="f.path"
      :field="f"
      :model-value="modelValue?.[f.path]"
      @update:modelValue="set(f.path, $event, modelValue ?? {}, $emit)" />
  </fieldset>
</template>
```

- [ ] **Step 4: RepeaterField**

```vue
<script setup lang="ts">
import type { FieldDescriptor } from '../../client/form-from-zod'
import FieldRenderer from './FieldRenderer.vue'
const props = defineProps<{ modelValue: any[]; label: string; itemFields: FieldDescriptor[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: any[]): void }>()
function update(i: number, key: string, v: unknown) {
  const next = [...(props.modelValue ?? [])]
  next[i] = { ...next[i], [key]: v }
  emit('update:modelValue', next)
}
function add() { emit('update:modelValue', [...(props.modelValue ?? []), {}]) }
function remove(i: number) {
  const next = [...(props.modelValue ?? [])]; next.splice(i, 1); emit('update:modelValue', next)
}
</script>
<template>
  <div class="space-y-2">
    <div class="text-sm text-zinc-600">{{ label }}</div>
    <div v-for="(item, i) in modelValue ?? []" :key="i" class="border rounded p-3 space-y-2">
      <FieldRenderer v-for="f in itemFields" :key="f.path"
        :field="f" :model-value="(item as any)?.[f.path]"
        @update:modelValue="update(i, f.path, $event)" />
      <button type="button" @click="remove(i)" class="text-sm text-red-600">Remove</button>
    </div>
    <button type="button" @click="add" class="text-sm rounded border px-3 py-1">Add</button>
  </div>
</template>
```

- [ ] **Step 5: RefField (typeahead via /api/vulse/entries/:collection or /api/vulse/users)**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { adminApi } from '../../client/api'
const props = defineProps<{ modelValue: string | null; label: string; refTarget: string }>()
defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()
const query = ref(''); const results = ref<{ id: string; title?: string; email?: string }[]>([])
async function search() {
  if (props.refTarget === 'user') results.value = await adminApi.get(`/api/vulse/users?q=${encodeURIComponent(query.value)}`)
  else {
    const rows = await adminApi.get<any[]>(`/api/vulse/entries/${props.refTarget}`)
    results.value = rows.map((r: any) => ({ id: r.id, title: r.content?.title ?? r.slug }))
  }
}
watch(query, () => { if (query.value.length >= 1) search() })
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <input v-model="query" :placeholder="`Search ${refTarget}…`" class="mt-1 w-full rounded border px-3 py-2" />
    <ul v-if="results.length" class="mt-1 border rounded bg-white max-h-48 overflow-auto">
      <li v-for="r in results" :key="r.id"
        @click="$emit('update:modelValue', r.id); query = r.title ?? r.email ?? r.id; results = []"
        class="px-3 py-2 hover:bg-zinc-100 cursor-pointer">{{ r.title ?? r.email ?? r.id }}</li>
    </ul>
  </label>
</template>
```

- [ ] **Step 6: MediaField + BlocksField stubs**

`MediaField.vue`:
```vue
<template><div class="border rounded p-4 text-sm text-zinc-500">Media picker — wired in Plan 5.</div></template>
```

`BlocksField.vue`:
```vue
<template><div class="border rounded p-4 text-sm text-zinc-500">Block editor — wired in Plan 4.</div></template>
```

- [ ] **Step 7: FieldRenderer dispatcher**

```vue
<script setup lang="ts">
import type { FieldDescriptor } from '../../client/form-from-zod'
import TextField from './TextField.vue'
import TextareaField from './TextareaField.vue'
import NumberField from './NumberField.vue'
import BoolField from './BoolField.vue'
import DateField from './DateField.vue'
import EnumField from './EnumField.vue'
import ObjectField from './ObjectField.vue'
import RepeaterField from './RepeaterField.vue'
import RefField from './RefField.vue'
import MediaField from './MediaField.vue'
import BlocksField from './BlocksField.vue'

defineProps<{ field: FieldDescriptor; modelValue: unknown }>()
defineEmits<{ (e: 'update:modelValue', v: unknown): void }>()
</script>
<template>
  <TextField v-if="field.widget === 'text'" :model-value="(modelValue as string) ?? ''" :label="field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
  <TextareaField v-else-if="field.widget === 'textarea'" :model-value="(modelValue as string) ?? ''" :label="field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
  <NumberField v-else-if="field.widget === 'number'" :model-value="modelValue as number" :label="field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
  <BoolField v-else-if="field.widget === 'bool'" :model-value="!!modelValue" :label="field.path" @update:modelValue="$emit('update:modelValue', $event)" />
  <DateField v-else-if="field.widget === 'date'" :model-value="modelValue as string | null" :label="field.path" @update:modelValue="$emit('update:modelValue', $event)" />
  <EnumField v-else-if="field.widget === 'enum'" :model-value="modelValue as string" :label="field.path" :options="field.options ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
  <RefField v-else-if="field.widget === 'ref'" :model-value="modelValue as string | null" :label="field.path" :ref-target="field.refTarget!" @update:modelValue="$emit('update:modelValue', $event)" />
  <MediaField v-else-if="field.widget === 'media'" />
  <BlocksField v-else-if="field.widget === 'blocks'" />
  <ObjectField v-else-if="field.widget === 'object'" :model-value="(modelValue as any) ?? {}" :label="field.path" :fields="field.children ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
  <RepeaterField v-else-if="field.widget === 'repeater'" :model-value="(modelValue as any[]) ?? []" :label="field.path" :item-fields="field.itemFields ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
</template>
```

- [ ] **Step 8: Commit**

```bash
git add packages/vulse/src/admin/components/fields
git commit -m "feat(vulse-admin): field renderer components"
```

---

### Task 9: EntryList and EntryForm

**Files:**
- Create: `packages/vulse/src/admin/components/EntryList.vue`
- Create: `packages/vulse/src/admin/components/EntryForm.vue`
- Create: `packages/vulse/src/admin/pages/collections/[name]/index.astro`
- Create: `packages/vulse/src/admin/pages/collections/[name]/new.astro`
- Create: `packages/vulse/src/admin/pages/collections/[name]/[id].astro`

- [ ] **Step 1: EntryList.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const props = defineProps<{ collection: string; columns: string[] }>()
const rows = ref<any[]>([])
onMounted(async () => { rows.value = await adminApi.get(`/api/vulse/entries/${props.collection}`) })
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-semibold">{{ collection }}</h1>
      <a :href="`/admin/collections/${collection}/new`" class="rounded bg-brand text-white px-4 py-2 text-sm">New</a>
    </div>
    <table class="w-full bg-white border rounded">
      <thead><tr class="border-b text-left text-sm">
        <th v-for="c in columns" :key="c" class="p-3">{{ c }}</th>
        <th class="p-3">Status</th>
      </tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="border-b text-sm">
          <td v-for="c in columns" :key="c" class="p-3">
            <a :href="`/admin/collections/${collection}/${r.id}`" class="text-brand underline-offset-2 hover:underline">
              {{ r.content?.[c] ?? '—' }}
            </a>
          </td>
          <td class="p-3">{{ r.status }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 2: EntryForm.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { adminApi, AdminApiError } from '../client/api'
import { reflectFields, type FieldDescriptor } from '../client/form-from-zod'
import FieldRenderer from './fields/FieldRenderer.vue'

// The schema is shipped from the server as JSON-schema-like JSON; the simplest path for now
// is to ship the field descriptors directly from the server's blueprint introspection.
// See Task 10 for the /api/vulse/blueprints route that returns descriptors.

const props = defineProps<{ collection: string; entryId?: string; fields: FieldDescriptor[]; initial: any }>()
const content = ref<Record<string, unknown>>(props.initial ?? {})
const slug = ref<string>(props.initial?.slug ?? '')
const status = ref<'draft' | 'published'>(props.initial?.status ?? 'draft')
const error = ref<string | null>(null); const saving = ref(false)

async function save() {
  saving.value = true; error.value = null
  try {
    if (props.entryId) {
      await adminApi.put(`/api/vulse/entries/${props.collection}/${props.entryId}`, { content: content.value, slug: slug.value, status: status.value })
    } else {
      const created = await adminApi.post<{ id: string }>(`/api/vulse/entries/${props.collection}`, { content: content.value, slug: slug.value, status: status.value })
      window.location.href = `/admin/collections/${props.collection}/${created.id}`
      return
    }
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : 'Save failed'
  } finally { saving.value = false }
}
</script>

<template>
  <form @submit.prevent="save" class="space-y-4 max-w-3xl">
    <label class="block">
      <span class="text-sm text-zinc-600">slug</span>
      <input v-model="slug" required class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <FieldRenderer v-for="f in fields" :key="f.path"
      :field="f" :model-value="content[f.path]"
      @update:modelValue="content = { ...content, [f.path]: $event }" />
    <label class="block">
      <span class="text-sm text-zinc-600">Status</span>
      <select v-model="status" class="mt-1 rounded border px-3 py-2">
        <option value="draft">Draft</option><option value="published">Published</option>
      </select>
    </label>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <button :disabled="saving" class="rounded bg-brand text-white px-4 py-2">
      {{ saving ? 'Saving…' : 'Save' }}
    </button>
  </form>
</template>
```

- [ ] **Step 3: Pages**

`pages/collections/[name]/index.astro`:
```astro
---
import AdminShell from '../../../components/AdminShell.astro'
import EntryList from '../../../components/EntryList.vue'
import { registryFromUserCollections } from '../../../../core/blueprints/load.js'
const reg = await registryFromUserCollections()
const bp = reg.get(Astro.params.name!)
if (!bp) return Astro.redirect('/admin')
const columns = bp.admin.listColumns ?? [bp.admin.titleField]
---
<AdminShell title={bp.label} activePath={`/admin/collections/${bp.name}`}>
  <EntryList client:load collection={bp.name} columns={columns} />
</AdminShell>
```

`pages/collections/[name]/new.astro`:
```astro
---
import AdminShell from '../../../components/AdminShell.astro'
import EntryForm from '../../../components/EntryForm.vue'
import { registryFromUserCollections } from '../../../../core/blueprints/load.js'
import { reflectFields } from '../../../client/form-from-zod.js'
const reg = await registryFromUserCollections()
const bp = reg.get(Astro.params.name!)
if (!bp) return Astro.redirect('/admin')
const fields = reflectFields(bp.schema as any)
---
<AdminShell title={`New ${bp.label}`} activePath={`/admin/collections/${bp.name}`}>
  <EntryForm client:load collection={bp.name} fields={fields} initial={{}} />
</AdminShell>
```

`pages/collections/[name]/[id].astro`:
```astro
---
import AdminShell from '../../../components/AdminShell.astro'
import EntryForm from '../../../components/EntryForm.vue'
import { registryFromUserCollections } from '../../../../core/blueprints/load.js'
import { reflectFields } from '../../../client/form-from-zod.js'
import { getRuntime } from '../../../../server/runtime.js'

const reg = await registryFromUserCollections()
const bp = reg.get(Astro.params.name!)
if (!bp) return Astro.redirect('/admin')
const fields = reflectFields(bp.schema as any)

const env = (Astro.locals as any).runtime?.env
const rt = await getRuntime(env, reg, new URL(Astro.request.url).origin)
const res = await rt.routes.entries.findById(new Request(Astro.request.url, { headers: Astro.request.headers }), { collection: bp.name, id: Astro.params.id! })
const body = await res.json() as { ok: true; data: any } | { ok: false }
if (!body.ok) return new Response('Not found', { status: 404 })
const initial = { ...body.data.content, slug: body.data.slug, status: body.data.status }
---
<AdminShell title={`Edit ${bp.label}`} activePath={`/admin/collections/${bp.name}`}>
  <EntryForm client:load collection={bp.name} entryId={Astro.params.id!} fields={fields} initial={initial} />
</AdminShell>
```

- [ ] **Step 4: Smoke-test in playground**

Sign in → navigate to `/admin/collections/page` → click "New" → fill in title + slug + body → Save → see entry in list → click entry → edit → save → reload → see new content.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/admin
git commit -m "feat(vulse-admin): collection list, create, edit pages with schema-driven form"
```

---

### Task 10: Users page

**Files:**
- Create: `packages/vulse/src/admin/components/UserList.vue`
- Create: `packages/vulse/src/admin/pages/users/index.astro`
- Create: `packages/vulse/src/admin/pages/users/[id].astro`

- [ ] **Step 1: UserList.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const users = ref<{ id: string; email: string; name: string; role: string }[]>([])
onMounted(async () => { users.value = await adminApi.get('/api/vulse/users') })
async function setRole(id: string, role: string) {
  await adminApi.put(`/api/vulse/users/${id}/role`, { role })
  users.value = users.value.map((u) => (u.id === id ? { ...u, role } : u))
}
</script>
<template>
  <table class="w-full bg-white border rounded text-sm">
    <thead><tr class="border-b text-left">
      <th class="p-3">Email</th><th class="p-3">Name</th><th class="p-3">Role</th>
    </tr></thead>
    <tbody>
      <tr v-for="u in users" :key="u.id" class="border-b">
        <td class="p-3">{{ u.email }}</td>
        <td class="p-3">{{ u.name }}</td>
        <td class="p-3">
          <select :value="u.role" @change="setRole(u.id, ($event.target as HTMLSelectElement).value)" class="rounded border px-2 py-1">
            <option>admin</option><option>editor</option><option>member</option>
          </select>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 2: Pages**

`pages/users/index.astro`:
```astro
---
import AdminShell from '../../components/AdminShell.astro'
import UserList from '../../components/UserList.vue'
---
<AdminShell title="Users" activePath="/admin/users">
  <h1 class="text-2xl font-semibold mb-4">Users</h1>
  <UserList client:load />
</AdminShell>
```

`pages/users/[id].astro` — read-only display of the user; rely on the table's role select for v1. Plan 7 adds invite + password reset.

```astro
---
import AdminShell from '../../components/AdminShell.astro'
---
<AdminShell title="User" activePath="/admin/users">
  <p class="text-sm text-zinc-600">Per-user detail page — invite/reset flows arrive in Plan 7.</p>
</AdminShell>
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/admin/components/UserList.vue packages/vulse/src/admin/pages/users
git commit -m "feat(vulse-admin): users list + role editor"
```

---

### Task 11: Settings page (key-value store)

**Files:**
- Create: `packages/vulse/src/core/repos/settings.ts`
- Create: `packages/vulse/src/server/routes/settings.ts`
- Create: `packages/vulse/src/admin/pages/settings/index.astro`
- Create: `packages/vulse/src/admin/components/SettingsForm.vue`
- Update `inject-routes.ts` to add `/api/vulse/settings` and `/api/vulse/settings/:key`.

- [ ] **Step 1: Repo + route**

`src/core/repos/settings.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { settings } from '../schema.js'

export class SettingsRepo {
  constructor(private db: VulseDb) {}
  async get<T = unknown>(key: string): Promise<T | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key))
    return (row?.value as T | undefined) ?? null
  }
  async set(key: string, value: unknown): Promise<void> {
    const now = new Date()
    await this.db.insert(settings).values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
  }
  async all(): Promise<Record<string, unknown>> {
    const rows = await this.db.select().from(settings)
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }
}
```

`src/server/routes/settings.ts`:

```ts
import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { SettingsRepo } from '../../core/repos/settings.js'

export function settingsRoutes(db: VulseDb, auth: Auth) {
  const repo = new SettingsRepo(db)
  return {
    list: defineHandler(auth, { requireRole: ['admin'] }, async () => await repo.all()),
    set: defineHandler(auth, {
      params: z.object({ key: z.string() }),
      body: z.object({ value: z.unknown() }),
      requireRole: ['admin'],
    }, async ({ params, body }) => { await repo.set(params.key, body.value); return { ok: true } }),
  }
}
```

- [ ] **Step 2: SettingsForm.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const values = ref<Record<string, string>>({})
async function load() {
  const all = await adminApi.get<Record<string, unknown>>('/api/vulse/settings')
  values.value = {
    siteName: String(all.siteName ?? ''),
    deployHookUrl: String(all.deployHookUrl ?? ''),
  }
}
async function save(key: string, raw: string) {
  await adminApi.put(`/api/vulse/settings/${key}`, { value: raw })
}
onMounted(load)
</script>

<template>
  <div class="space-y-4 max-w-md">
    <label class="block">
      <span class="text-sm text-zinc-600">Site name</span>
      <input v-model="values.siteName" @change="save('siteName', values.siteName)" class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <label class="block">
      <span class="text-sm text-zinc-600">Deploy hook URL (CF Pages rebuild webhook)</span>
      <input v-model="values.deployHookUrl" @change="save('deployHookUrl', values.deployHookUrl)" class="mt-1 w-full rounded border px-3 py-2" />
    </label>
  </div>
</template>
```

- [ ] **Step 3: Page**

```astro
---
import AdminShell from '../../components/AdminShell.astro'
import SettingsForm from '../../components/SettingsForm.vue'
---
<AdminShell title="Settings" activePath="/admin/settings">
  <h1 class="text-2xl font-semibold mb-4">Settings</h1>
  <SettingsForm client:load />
</AdminShell>
```

- [ ] **Step 4: Wire routes (update inject-routes.ts + create endpoint files)**

Add `/api/vulse/settings` and `/api/vulse/settings/[key]` endpoints following the pattern from Plan 2 Task 11.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/core/repos/settings.ts packages/vulse/src/server/routes/settings.ts packages/vulse/src/admin/pages/settings packages/vulse/src/admin/components/SettingsForm.vue
git commit -m "feat(vulse-admin): settings page backed by key-value store"
```

---

## Self-review

- **Spec coverage:** §4.1 routes → Tasks 4, 5, 9, 10, 11 (auth/settings split deferred to Plan 7 by design); §4.2 form table → Tasks 7, 8; §4.4 access UI → handled via middleware (Task 3) + server-side enforcement from Plan 2.
- **Placeholders:** MediaField + BlocksField are stub components (Task 8 Step 6) — explicitly marked as Plan 4 / Plan 5 wiring. Users page detail is intentionally minimal pending Plan 7.
- **Type consistency:** `FieldDescriptor`, `Widget`, `adminApi` reused across components. Settings repo + route follow the Plan 2 pattern.
- **What this plan does NOT do:** block editor (Plan 4), revisions UI (Plan 4), media library/upload (Plan 5), end-user auth UI (Plan 7).
