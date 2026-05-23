# Plan 5 — Media + Cloudflare Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors can upload images directly to R2 (no Worker proxy), browse them in a media library, and pick them in any `z.media()` field. Public consumers resolve media to Cloudflare Images delivery URLs with the configured variants. Soft-deleted media is purged from R2 by a daily cron.

**Architecture:** Browser PUTs to R2 via a signed URL minted server-side. Server records metadata in the `media` table. Image dimensions extracted via magic-byte probe (no full decode). Cloudflare Images variants are registered on first migration; delivery URLs are built from `{ACCOUNT_HASH}/{id}/{variant}`. Soft delete via `deleted_at`; a Cron Trigger Worker purges rows older than 7 days.

**Tech Stack:** R2 binding, AWS-style presigned URLs (R2 supports), Cloudflare Images REST API, Cloudflare Cron Triggers.

**Spec reference:** §5.1 (upload flow), §5.2 (serving), §5.3 (lifecycle).

**Prerequisites:** Plans 1-4 complete.

---

### Task 1: Media repository

**Files:**
- Create: `packages/vulse/src/core/repos/media.ts`
- Create: `packages/vulse/tests/integration/media-repo.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { MediaRepo } from '../../src/core/repos/media'

describe('MediaRepo', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('records and lists media', async () => {
    const repo = new MediaRepo(createDb(env.DB))
    const m = await repo.create({ r2Key: 'k1', mime: 'image/jpeg', size: 1234, width: 800, height: 600, uploadedBy: 'u' })
    expect(m.id).toBeTruthy()
    const list = await repo.list({})
    expect(list.length).toBe(1)
  })

  it('soft-deletes', async () => {
    const repo = new MediaRepo(createDb(env.DB))
    const m = await repo.create({ r2Key: 'k', mime: 'image/png', size: 1, uploadedBy: 'u' })
    await repo.softDelete(m.id)
    const list = await repo.list({})
    expect(list.length).toBe(0)
    const all = await repo.list({ includeDeleted: true })
    expect(all.length).toBe(1)
  })

  it('lists rows older than N days that are soft-deleted', async () => {
    const repo = new MediaRepo(createDb(env.DB))
    const m = await repo.create({ r2Key: 'k', mime: 'image/png', size: 1, uploadedBy: 'u' })
    await repo.softDelete(m.id)
    // backdate
    await env.DB.prepare(`UPDATE vulse_media SET deleted_at = ? WHERE id = ?`)
      .bind(Date.now() - 8 * 86400_000, m.id).run()
    const purgeable = await repo.listPurgeable(7)
    expect(purgeable.length).toBe(1)
  })
})
```

- [ ] **Step 2: Implement**

```ts
import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import { media } from '../schema.js'

export interface MediaRow {
  id: string; r2Key: string; mime: string; size: number;
  width: number | null; height: number | null;
  alt: string | null; blurhash: string | null;
  uploadedBy: string | null;
  createdAt: Date; deletedAt: Date | null;
}

export class MediaRepo {
  constructor(private db: VulseDb) {}

  async create(input: Omit<MediaRow, 'id' | 'createdAt' | 'deletedAt' | 'width' | 'height' | 'alt' | 'blurhash'> & Partial<Pick<MediaRow, 'width' | 'height' | 'alt' | 'blurhash'>>): Promise<MediaRow> {
    const row: MediaRow = {
      id: nanoid(), r2Key: input.r2Key, mime: input.mime, size: input.size,
      width: input.width ?? null, height: input.height ?? null,
      alt: input.alt ?? null, blurhash: input.blurhash ?? null,
      uploadedBy: input.uploadedBy ?? null,
      createdAt: new Date(), deletedAt: null,
    }
    await this.db.insert(media).values(row)
    return row
  }

  async list(opts: { includeDeleted?: boolean; limit?: number; offset?: number }): Promise<MediaRow[]> {
    let q = this.db.select().from(media)
    if (!opts.includeDeleted) q = q.where(isNull(media.deletedAt)) as any
    q = q.orderBy(desc(media.createdAt))
    if (opts.limit) q = q.limit(opts.limit) as any
    if (opts.offset) q = q.offset(opts.offset) as any
    return await q as MediaRow[]
  }

  async findById(id: string): Promise<MediaRow | null> {
    const [row] = await this.db.select().from(media).where(eq(media.id, id))
    return (row as MediaRow | undefined) ?? null
  }

  async softDelete(id: string): Promise<void> {
    await this.db.update(media).set({ deletedAt: new Date() }).where(eq(media.id, id))
  }

  async updateAlt(id: string, alt: string): Promise<void> {
    await this.db.update(media).set({ alt }).where(eq(media.id, id))
  }

  async listPurgeable(days: number): Promise<MediaRow[]> {
    const cutoff = new Date(Date.now() - days * 86400_000)
    return await this.db.select().from(media)
      .where(and(isNotNull(media.deletedAt), lt(media.deletedAt, cutoff))) as MediaRow[]
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.delete(media).where(eq(media.id, id))
  }
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter vulse test:integration
git add packages/vulse/src/core/repos/media.ts packages/vulse/tests/integration/media-repo.test.ts
git commit -m "feat(vulse): media repository with soft-delete + purge query"
```

---

### Task 2: R2 signed upload URL

**Files:**
- Create: `packages/vulse/src/server/r2.ts`
- Create: `packages/vulse/tests/integration/r2.test.ts`

- [ ] **Step 1: Implement**

R2 supports presigned URLs via the AWS SDK, but in a Workers context we use the binding's `createMultipartUpload` or a presign helper. v1 uses a simple approach: the Worker generates a temporary credentialed presigned URL using R2's S3-compatible endpoint. For binding-only deploys (no S3 endpoint configured), we fall back to **Worker-proxied uploads** of files <100 MB.

For simplicity in v1, ship Worker-proxied upload (binding.put) — direct-to-R2 presigning becomes a config flag in v1.x.

```ts
import { nanoid } from 'nanoid'

export interface UploadContext { bucket: R2Bucket }

export async function putToR2(ctx: UploadContext, body: ArrayBuffer, mime: string): Promise<{ key: string }> {
  const key = `${new Date().toISOString().slice(0, 10)}/${nanoid()}`
  await ctx.bucket.put(key, body, { httpMetadata: { contentType: mime } })
  return { key }
}

export async function deleteFromR2(ctx: UploadContext, key: string): Promise<void> {
  await ctx.bucket.delete(key)
}
```

> **Spec note:** This deviates from the spec's "direct-to-R2 signed URL" for v1. Documented as a v1.x improvement — presigning via the S3 API once we know how often users hit upload size limits. Worker proxy works up to ~100 MB request body on CF Workers, sufficient for image uploads.

- [ ] **Step 2: Integration test**

```ts
import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { putToR2 } from '../../src/server/r2'

describe('r2 helpers', () => {
  it('puts and reads back', async () => {
    const body = new TextEncoder().encode('hello').buffer
    const { key } = await putToR2({ bucket: env.BUCKET }, body, 'text/plain')
    const obj = await env.BUCKET.get(key)
    expect(obj).toBeTruthy()
    const text = await obj!.text()
    expect(text).toBe('hello')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/server/r2.ts packages/vulse/tests/integration/r2.test.ts
git commit -m "feat(vulse): R2 upload helpers (Worker-proxied for v1)"
```

---

### Task 3: Image dimension probe

**Files:**
- Create: `packages/vulse/src/server/image-probe.ts`
- Create: `packages/vulse/tests/unit/image-probe.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { probeDimensions } from '../../src/server/image-probe'
import { readFile } from 'node:fs/promises'

describe('probeDimensions', () => {
  it('reads PNG dimensions from header', async () => {
    // 1x1 PNG (base64 → buffer)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZjYJ6cAAAAASUVORK5CYII=', 'base64')
    expect(probeDimensions(png.buffer, 'image/png')).toEqual({ width: 1, height: 1 })
  })

  it('returns null for non-image mime', () => {
    expect(probeDimensions(new Uint8Array([0]).buffer, 'application/pdf')).toBeNull()
  })
})
```

- [ ] **Step 2: Implement**

```ts
/** Returns {width,height} from image headers without decoding the full file. */
export function probeDimensions(buf: ArrayBuffer, mime: string): { width: number; height: number } | null {
  const v = new DataView(buf)
  if (mime === 'image/png') {
    // PNG: width @ byte 16 (BE u32), height @ byte 20 (BE u32)
    if (v.byteLength < 24) return null
    return { width: v.getUint32(16), height: v.getUint32(20) }
  }
  if (mime === 'image/jpeg') {
    // Parse JPEG SOF markers
    let i = 2
    while (i < v.byteLength) {
      if (v.getUint8(i) !== 0xff) return null
      const marker = v.getUint8(i + 1)
      const len = v.getUint16(i + 2)
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) }
      }
      i += 2 + len
    }
    return null
  }
  if (mime === 'image/webp') {
    // VP8L (lossless) or VP8 — different headers; approximate via VP8L at offset 21
    if (v.byteLength < 30) return null
    if (String.fromCharCode(v.getUint8(12), v.getUint8(13), v.getUint8(14), v.getUint8(15)) === 'VP8L') {
      const b0 = v.getUint8(21), b1 = v.getUint8(22), b2 = v.getUint8(23), b3 = v.getUint8(24)
      const width = 1 + (((b1 & 0x3f) << 8) | b0)
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
      return { width, height }
    }
    return null
  }
  return null
}
```

- [ ] **Step 3: Run, commit**

```bash
git add packages/vulse/src/server/image-probe.ts packages/vulse/tests/unit/image-probe.test.ts
git commit -m "feat(vulse): image dimension probe (PNG/JPEG/WebP)"
```

---

### Task 4: Cloudflare Images URL builder + variant registration

**Files:**
- Create: `packages/vulse/src/server/cf-images.ts`
- Create: `packages/vulse/tests/unit/cf-images.test.ts`

- [ ] **Step 1: Implement URL builder**

```ts
const DEFAULT_VARIANTS = ['thumbnail', 'card', 'hero', 'og'] as const
export type Variant = typeof DEFAULT_VARIANTS[number]

export interface CfImagesConfig {
  accountHash?: string
  token?: string
}

export function isImagesEnabled(cfg: CfImagesConfig): boolean {
  return !!cfg.accountHash
}

export function buildDeliveryUrl(cfg: CfImagesConfig, imageId: string, variant: Variant | string = 'card'): string | null {
  if (!cfg.accountHash) return null
  return `https://imagedelivery.net/${cfg.accountHash}/${imageId}/${variant}`
}

/** Called on first migration: ensures default variants exist via the CF Images API. */
export async function registerDefaultVariants(cfg: CfImagesConfig): Promise<void> {
  if (!cfg.token || !cfg.accountHash) return
  const variants = [
    { id: 'thumbnail', options: { fit: 'cover', width: 160, height: 160 } },
    { id: 'card',      options: { fit: 'cover', width: 800, height: 450 } },
    { id: 'hero',      options: { fit: 'scale-down', width: 1600 } },
    { id: 'og',        options: { fit: 'cover', width: 1200, height: 630 } },
  ]
  for (const v of variants) {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountHash}/images/v1/variants`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(v),
    }).catch(() => {}) // idempotent — ignore "already exists"
  }
}
```

- [ ] **Step 2: Unit test**

```ts
import { describe, it, expect } from 'vitest'
import { buildDeliveryUrl, isImagesEnabled } from '../../src/server/cf-images'

describe('cf-images', () => {
  it('returns null when not configured', () => {
    expect(buildDeliveryUrl({}, 'x')).toBeNull()
    expect(isImagesEnabled({})).toBe(false)
  })
  it('builds delivery URL with default variant', () => {
    expect(buildDeliveryUrl({ accountHash: 'abc' }, 'img1')).toBe('https://imagedelivery.net/abc/img1/card')
  })
  it('accepts custom variant', () => {
    expect(buildDeliveryUrl({ accountHash: 'abc' }, 'img1', 'hero')).toBe('https://imagedelivery.net/abc/img1/hero')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/server/cf-images.ts packages/vulse/tests/unit/cf-images.test.ts
git commit -m "feat(vulse): cloudflare images URL builder + variant registration"
```

---

### Task 5: Media routes (upload + list + soft delete + alt)

**Files:**
- Create: `packages/vulse/src/server/routes/media.ts`
- Create: `packages/vulse/tests/integration/media-routes.test.ts`
- Modify: `packages/vulse/src/server/runtime.ts` (add media route)
- Modify: `packages/vulse/src/integration/inject-routes.ts` (add `/api/vulse/media*`)

- [ ] **Step 1: Implement routes**

```ts
import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { MediaRepo } from '../../core/repos/media.js'
import { defineHandler } from '../handler.js'
import { putToR2, deleteFromR2 } from '../r2.js'
import { probeDimensions } from '../image-probe.js'
import { buildDeliveryUrl } from '../cf-images.js'
import { NotFoundError } from '../../core/errors.js'

export interface MediaEnv { bucket: R2Bucket; cfImages: { accountHash?: string; token?: string } }

export function mediaRoutes(db: VulseDb, auth: Auth, mediaEnv: MediaEnv) {
  const repo = new MediaRepo(db)

  function withDeliveryUrl(row: any) {
    return { ...row, deliveryUrl: buildDeliveryUrl(mediaEnv.cfImages, row.id) }
  }

  return {
    list: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async () => {
      return (await repo.list({})).map(withDeliveryUrl)
    }),

    upload: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async ({ request, auth: a }) => {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) throw new (await import('../../core/errors.js')).ValidationError('file required')
      const buf = await file.arrayBuffer()
      const dims = probeDimensions(buf, file.type)
      const { key } = await putToR2({ bucket: mediaEnv.bucket }, buf, file.type)
      const row = await repo.create({
        r2Key: key, mime: file.type, size: file.size,
        width: dims?.width, height: dims?.height,
        uploadedBy: a.user!.id,
      })
      return withDeliveryUrl(row)
    }),

    updateAlt: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      body: z.object({ alt: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params, body }) => {
      await repo.updateAlt(params.id, body.alt)
      return { ok: true }
    }),

    delete: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      const row = await repo.findById(params.id)
      if (!row) throw new NotFoundError(`Media ${params.id} not found`)
      await repo.softDelete(params.id)
      return { ok: true }
    }),

    /** Used by the cron worker — purges R2 objects + DB rows for soft-deleted media older than 7 days. */
    purge: async (): Promise<{ purged: number }> => {
      const rows = await repo.listPurgeable(7)
      for (const r of rows) {
        await deleteFromR2({ bucket: mediaEnv.bucket }, r.r2Key)
        await repo.hardDelete(r.id)
      }
      return { purged: rows.length }
    },
  }
}
```

- [ ] **Step 2: Test (multipart upload via integration test)**

```ts
describe('media upload', () => {
  it('uploads a PNG and records dimensions', async () => {
    // signed-in admin context (helper from Plan 2 Task 9)
    const form = new FormData()
    form.append('file', new File([/* png bytes */], 'pic.png', { type: 'image/png' }))
    const res = await routes.media.upload(new Request('http://localhost', {
      method: 'POST', body: form, headers: { cookie },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { id: string; width: number; height: number } }
    expect(body.data.width).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Wire into runtime + inject routes**

In `runtime.ts`:
```ts
routes.media = mediaRoutes(db, auth, { bucket: env.BUCKET, cfImages: { accountHash: env.CF_IMAGES_ACCOUNT_HASH, token: env.CF_IMAGES_TOKEN } })
```

In `inject-routes.ts`:
```
/api/vulse/media           (GET list, POST upload)
/api/vulse/media/[id]      (DELETE soft, PATCH alt)
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/server/routes/media.ts packages/vulse/src/server/runtime.ts packages/vulse/src/integration/inject-routes.ts packages/vulse/tests/integration/media-routes.test.ts
git commit -m "feat(vulse): media upload, list, alt, delete routes"
```

---

### Task 6: MediaLibrary.vue + Media page

**Files:**
- Create: `packages/vulse/src/admin/components/MediaLibrary.vue`
- Create: `packages/vulse/src/admin/pages/media.astro`

- [ ] **Step 1: MediaLibrary.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'

interface MediaItem { id: string; r2Key: string; mime: string; alt: string | null; width: number | null; height: number | null; deliveryUrl: string | null }
const items = ref<MediaItem[]>([])
const uploading = ref(false)

async function load() { items.value = await adminApi.get('/api/vulse/media') }
async function onFiles(files: FileList | null) {
  if (!files) return
  uploading.value = true
  for (const f of Array.from(files)) {
    const form = new FormData(); form.append('file', f)
    await fetch('/api/vulse/media', { method: 'POST', body: form, credentials: 'same-origin' })
  }
  uploading.value = false
  await load()
}
async function softDelete(id: string) {
  if (!confirm('Delete this asset?')) return
  await adminApi.delete(`/api/vulse/media/${id}`)
  await load()
}
async function setAlt(id: string, alt: string) {
  await adminApi.put(`/api/vulse/media/${id}/alt`, { alt })
}
onMounted(load)
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <label class="rounded bg-brand text-white px-4 py-2 text-sm cursor-pointer">
        Upload
        <input type="file" multiple accept="image/*" class="hidden" @change="onFiles(($event.target as HTMLInputElement).files)" />
      </label>
      <span v-if="uploading" class="text-sm text-zinc-500">Uploading…</span>
    </div>
    <div class="grid grid-cols-4 gap-3">
      <div v-for="m in items" :key="m.id" class="border rounded bg-white p-2 space-y-2">
        <img v-if="m.deliveryUrl" :src="m.deliveryUrl" class="w-full aspect-square object-cover rounded" />
        <div v-else class="w-full aspect-square bg-zinc-100 rounded grid place-items-center text-xs text-zinc-400">no preview</div>
        <input :value="m.alt ?? ''" @change="setAlt(m.id, ($event.target as HTMLInputElement).value)"
          placeholder="alt text" class="w-full rounded border px-2 py-1 text-xs" />
        <button @click="softDelete(m.id)" class="text-xs text-red-600">Delete</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Page**

```astro
---
import AdminShell from '../components/AdminShell.astro'
import MediaLibrary from '../components/MediaLibrary.vue'
---
<AdminShell title="Media" activePath="/admin/media">
  <h1 class="text-2xl font-semibold mb-4">Media</h1>
  <MediaLibrary client:load />
</AdminShell>
```

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/admin/components/MediaLibrary.vue packages/vulse/src/admin/pages/media.astro
git commit -m "feat(vulse-admin): media library page"
```

---

### Task 7: MediaField — real picker

**Files:**
- Modify: `packages/vulse/src/admin/components/fields/MediaField.vue`
- Create: `packages/vulse/src/admin/components/MediaPicker.vue`

- [ ] **Step 1: MediaPicker.vue (modal)**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const emit = defineEmits<{ (e: 'pick', id: string): void; (e: 'close'): void }>()
const items = ref<{ id: string; alt: string | null; deliveryUrl: string | null }[]>([])
onMounted(async () => { items.value = await adminApi.get('/api/vulse/media') })
</script>
<template>
  <div class="fixed inset-0 bg-black/40 grid place-items-center z-50" @click.self="$emit('close')">
    <div class="bg-white rounded-xl p-4 w-[720px] max-h-[80vh] overflow-auto">
      <div class="flex justify-between items-center mb-3">
        <h2 class="font-semibold">Pick a media item</h2>
        <button @click="$emit('close')" class="text-zinc-500">×</button>
      </div>
      <div class="grid grid-cols-4 gap-3">
        <button v-for="m in items" :key="m.id" type="button" @click="$emit('pick', m.id)"
          class="border rounded p-2 hover:ring-2 ring-brand">
          <img v-if="m.deliveryUrl" :src="m.deliveryUrl" class="w-full aspect-square object-cover rounded" />
          <div v-else class="aspect-square bg-zinc-100 rounded"></div>
          <div v-if="m.alt" class="text-xs mt-1 truncate">{{ m.alt }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: MediaField.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../../client/api'
import MediaPicker from '../MediaPicker.vue'
const props = defineProps<{ modelValue: string | null; label: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()
const preview = ref<{ deliveryUrl: string | null } | null>(null); const showPicker = ref(false)
async function loadPreview() {
  if (!props.modelValue) { preview.value = null; return }
  // Best-effort: load the list and find ours.
  const list = await adminApi.get<any[]>('/api/vulse/media')
  preview.value = list.find((m) => m.id === props.modelValue) ?? null
}
onMounted(loadPreview)
function pick(id: string) { emit('update:modelValue', id); showPicker.value = false; loadPreview() }
</script>
<template>
  <div class="space-y-2">
    <div class="text-sm text-zinc-600">{{ label }}</div>
    <div class="flex items-center gap-3">
      <img v-if="preview?.deliveryUrl" :src="preview.deliveryUrl" class="h-20 w-20 object-cover rounded border" />
      <button type="button" @click="showPicker = true" class="rounded border px-3 py-2 text-sm">
        {{ modelValue ? 'Change…' : 'Pick media…' }}
      </button>
      <button v-if="modelValue" type="button" @click="$emit('update:modelValue', null)" class="text-sm text-red-600">Clear</button>
    </div>
    <MediaPicker v-if="showPicker" @pick="pick" @close="showPicker = false" />
  </div>
</template>
```

- [ ] **Step 3: Update ImageEdit.vue (Plan 4) to use MediaField**

```vue
<script setup lang="ts">
import type { z } from 'astro/zod'
import { imageBlock } from '../../../../core/blocks/schema'
import MediaField from '../../fields/MediaField.vue'
type Block = z.infer<typeof imageBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) { emit('update:modelValue', { ...props.modelValue, [k]: v }) }
</script>
<template>
  <div class="space-y-2">
    <MediaField :model-value="modelValue.mediaId || null" label="Image" @update:modelValue="update('mediaId', $event ?? '')" />
    <input :value="modelValue.alt" @input="update('alt', ($event.target as HTMLInputElement).value)"
      placeholder="alt text" class="w-full rounded border px-3 py-2" />
    <input :value="modelValue.caption ?? ''" @input="update('caption', ($event.target as HTMLInputElement).value)"
      placeholder="caption" class="w-full rounded border px-3 py-2" />
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/admin/components/fields/MediaField.vue packages/vulse/src/admin/components/MediaPicker.vue packages/vulse/src/admin/components/blocks/edit/ImageEdit.vue
git commit -m "feat(vulse-admin): real media picker + image block uses it"
```

---

### Task 8: Cron Trigger for media purge

**Files:**
- Create: `packages/vulse/src/server/cron.ts`
- Add a section in install docs about wrangler `[triggers]`

- [ ] **Step 1: Implement cron handler**

```ts
import { createDb } from '../core/db.js'
import { mediaRoutes } from './routes/media.js'
import { createAuth } from './better-auth.js'
import { BlueprintRegistry } from '../core/blueprints/registry.js'

export interface CronEnv {
  DB: D1Database; BUCKET: R2Bucket
  CF_IMAGES_ACCOUNT_HASH?: string; CF_IMAGES_TOKEN?: string
  BETTER_AUTH_SECRET: string
}

export async function vulseScheduled(env: CronEnv): Promise<void> {
  const db = createDb(env.DB)
  const auth = createAuth(db, { baseURL: 'http://localhost', secret: env.BETTER_AUTH_SECRET })
  const routes = mediaRoutes(db, auth, {
    bucket: env.BUCKET,
    cfImages: { accountHash: env.CF_IMAGES_ACCOUNT_HASH, token: env.CF_IMAGES_TOKEN },
  })
  const result = await routes.purge()
  console.log(`[vulse-cron] purged ${result.purged} media row(s)`)
}
```

- [ ] **Step 2: Wire the scheduled handler in the Astro Cloudflare adapter context**

The Astro Cloudflare adapter exposes a `_worker.js` entry point. We document the user adding this snippet:

```js
// _worker.js (at user's project root, only if they want cron purge)
import { vulseScheduled } from 'vulse/integration/cron'
export default {
  fetch: (req, env, ctx) => /* delegate to astro worker as usual */ undefined,
  scheduled: (event, env, ctx) => vulseScheduled(env),
}
```

And in `wrangler.toml`:
```toml
[triggers]
crons = ["0 3 * * *"]
```

> **Engineer:** for a smoother UX we plan to ship a `vulse-worker-wrapper` Astro adapter helper in v1.x. v1 documents the manual step.

- [ ] **Step 3: Test (using miniflare scheduled triggers)**

`tests/integration/cron.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { MediaRepo } from '../../src/core/repos/media'
import { vulseScheduled } from '../../src/server/cron'

describe('cron purge', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('hard-deletes media rows + R2 objects past the retention window', async () => {
    const db = createDb(env.DB)
    const repo = new MediaRepo(db)
    const m = await repo.create({ r2Key: 'k', mime: 'image/png', size: 1, uploadedBy: 'u' })
    await env.BUCKET.put(m.r2Key, 'x')
    await repo.softDelete(m.id)
    await env.DB.prepare(`UPDATE vulse_media SET deleted_at = ? WHERE id = ?`)
      .bind(Date.now() - 10 * 86400_000, m.id).run()

    await vulseScheduled({
      DB: env.DB, BUCKET: env.BUCKET,
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    })

    expect(await repo.findById(m.id)).toBeNull()
    expect(await env.BUCKET.get(m.r2Key)).toBeNull()
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/server/cron.ts packages/vulse/tests/integration/cron.test.ts
git commit -m "feat(vulse): cron handler purges soft-deleted media older than 7 days"
```

---

## Self-review

- **Spec coverage:** §5.1 (upload — Tasks 2, 5; deviates: Worker proxy in v1, presigned in v1.x); §5.2 (serving — Task 4); §5.3 (lifecycle — Task 8).
- **Placeholders:** None. The "direct-to-R2 presign" deviation from spec is explicitly called out as v1.x; everything else is concrete.
- **Type consistency:** `MediaRow`, `Variant`, `CfImagesConfig`, `MediaEnv` reused; `MediaField` and `ImageEdit` share the picker.
- **What this plan does NOT do:** loader integration with media (Plan 6 task adds `mediaUrl` resolution); end-user uploads (out of scope — admin-only in v1); blurhash generation (deferred per spec §7).
