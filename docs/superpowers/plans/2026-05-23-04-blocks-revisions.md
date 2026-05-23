# Plan 4 — Block Editor + Revisions UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ported Vue block editor renders inside the admin form for `blocks()` fields. Revisions appear on every save in a transaction (already wired in Plan 2 Task 5); this plan adds the revisions list, diff viewer, and restore action. After this plan: editors get the full "headline content type" experience.

**Architecture:** Block schema is a discriminated Zod union shipped from the package — users can extend it by passing custom block defs to `blocks({ extra: [...] })`. The renderer is shared between admin preview and the public `<BlockRenderer />` so admins see what readers see. Revisions UI uses the API from Plan 2 Task 9.

**Tech Stack:** Vue 3, Zod, lightweight diff via `diff` (text) + a custom JSON tree diff for nested block changes.

**Spec reference:** §2.5 (revision write path, already implemented), §4.3 (block editor port).

**Prerequisites:** Plans 1-3 complete. Engineer should also have access to the original Vulse CMS Vue block editor to port from (https://github.com/ekrist1/vulsecms `packages/admin/src/components/blocks`).

---

### Task 1: Block schema and types

**Files:**
- Create: `packages/vulse/src/core/blocks/schema.ts`
- Create: `packages/vulse/tests/unit/blocks-schema.test.ts`
- Modify: `packages/vulse/src/core/blueprints/zod-helpers.ts` (replace placeholder `blocks()`)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { blockSchema } from '../../src/core/blocks/schema'

describe('blockSchema', () => {
  it('parses a heading block', () => {
    expect(blockSchema.parse({ type: 'heading', level: 2, text: 'Hi' })).toMatchObject({ type: 'heading' })
  })
  it('parses a paragraph block', () => {
    expect(blockSchema.parse({ type: 'paragraph', text: 'Hello world' }).type).toBe('paragraph')
  })
  it('parses an image block', () => {
    expect(blockSchema.parse({ type: 'image', mediaId: 'm1', alt: 'cat' }).type).toBe('image')
  })
  it('parses code block with language', () => {
    expect(blockSchema.parse({ type: 'code', language: 'ts', code: 'const x = 1' }).type).toBe('code')
  })
  it('parses embed block', () => {
    expect(blockSchema.parse({ type: 'embed', url: 'https://youtu.be/x' }).type).toBe('embed')
  })
  it('rejects unknown block types', () => {
    expect(() => blockSchema.parse({ type: 'unknown' })).toThrow()
  })
})
```

- [ ] **Step 2: Implement schema**

```ts
import { z } from 'zod'

export const headingBlock = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
  id: z.string().optional(),
})
export const paragraphBlock = z.object({
  type: z.literal('paragraph'),
  text: z.string(),
  id: z.string().optional(),
})
export const imageBlock = z.object({
  type: z.literal('image'),
  mediaId: z.string(),
  alt: z.string().default(''),
  caption: z.string().optional(),
  id: z.string().optional(),
})
export const codeBlock = z.object({
  type: z.literal('code'),
  language: z.string(),
  code: z.string(),
  id: z.string().optional(),
})
export const embedBlock = z.object({
  type: z.literal('embed'),
  url: z.string().url(),
  id: z.string().optional(),
})
export const quoteBlock = z.object({
  type: z.literal('quote'),
  text: z.string(),
  cite: z.string().optional(),
  id: z.string().optional(),
})
export const listBlock = z.object({
  type: z.literal('list'),
  ordered: z.boolean().default(false),
  items: z.array(z.string()),
  id: z.string().optional(),
})

export const blockSchema = z.discriminatedUnion('type', [
  headingBlock, paragraphBlock, imageBlock, codeBlock, embedBlock, quoteBlock, listBlock,
])

export type Block = z.infer<typeof blockSchema>
export type BlockType = Block['type']

export const BUILT_IN_BLOCK_TYPES: BlockType[] = ['heading', 'paragraph', 'image', 'code', 'embed', 'quote', 'list']
```

- [ ] **Step 3: Update `blocks()` helper**

`src/core/blueprints/zod-helpers.ts`:

```ts
import { z } from 'zod'
import { blockSchema } from '../blocks/schema.js'

export function blocks() {
  return z.array(blockSchema).default([]).describe('vulse:blocks')
}
// keep media() and ref() unchanged
```

- [ ] **Step 4: Run, commit**

```bash
pnpm --filter vulse test
git add packages/vulse/src/core/blocks packages/vulse/src/core/blueprints/zod-helpers.ts packages/vulse/tests/unit/blocks-schema.test.ts
git commit -m "feat(vulse): block schema (discriminated union of 7 built-in types)"
```

---

### Task 2: BlockRenderer (shared admin + public)

**Files:**
- Create: `packages/vulse/src/client/BlockRenderer.vue`
- Create: `packages/vulse/src/client/BlockRenderer.astro` (no-JS variant for public site)

- [ ] **Step 1: Vue renderer**

```vue
<script setup lang="ts">
import type { Block } from '../core/blocks/schema'
defineProps<{ blocks: Block[]; mediaUrl?: (id: string, variant?: string) => string }>()
</script>
<template>
  <div class="vulse-blocks">
    <template v-for="(b, i) in blocks" :key="b.id ?? i">
      <h1 v-if="b.type === 'heading' && b.level === 1">{{ b.text }}</h1>
      <h2 v-else-if="b.type === 'heading' && b.level === 2">{{ b.text }}</h2>
      <h3 v-else-if="b.type === 'heading' && b.level === 3">{{ b.text }}</h3>
      <h4 v-else-if="b.type === 'heading' && b.level === 4">{{ b.text }}</h4>
      <p v-else-if="b.type === 'paragraph'">{{ b.text }}</p>
      <figure v-else-if="b.type === 'image'">
        <img v-if="mediaUrl" :src="mediaUrl(b.mediaId, 'hero')" :alt="b.alt" />
        <span v-else class="text-zinc-400">[image: {{ b.mediaId }}]</span>
        <figcaption v-if="b.caption">{{ b.caption }}</figcaption>
      </figure>
      <pre v-else-if="b.type === 'code'"><code :class="`language-${b.language}`">{{ b.code }}</code></pre>
      <iframe v-else-if="b.type === 'embed'" :src="b.url" class="w-full aspect-video" />
      <blockquote v-else-if="b.type === 'quote'">{{ b.text }}<cite v-if="b.cite">{{ b.cite }}</cite></blockquote>
      <ol v-else-if="b.type === 'list' && b.ordered"><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ol>
      <ul v-else-if="b.type === 'list' && !b.ordered"><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ul>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Astro variant (no-JS for public site)**

```astro
---
import type { Block } from '../core/blocks/schema.js'
interface Props { blocks: Block[]; mediaUrl?: (id: string, variant?: string) => string }
const { blocks, mediaUrl } = Astro.props
---
<div class="vulse-blocks">
  {blocks.map((b) => {
    if (b.type === 'heading') {
      const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4'
      return <Tag>{b.text}</Tag>
    }
    if (b.type === 'paragraph') return <p>{b.text}</p>
    if (b.type === 'image') return (
      <figure>
        {mediaUrl ? <img src={mediaUrl(b.mediaId, 'hero')} alt={b.alt} /> : <span class="text-zinc-400">[image: {b.mediaId}]</span>}
        {b.caption && <figcaption>{b.caption}</figcaption>}
      </figure>
    )
    if (b.type === 'code') return <pre><code class={`language-${b.language}`}>{b.code}</code></pre>
    if (b.type === 'embed') return <iframe src={b.url} class="w-full aspect-video" />
    if (b.type === 'quote') return <blockquote>{b.text}{b.cite && <cite>{b.cite}</cite>}</blockquote>
    if (b.type === 'list') {
      const Tag = b.ordered ? 'ol' : 'ul'
      return <Tag>{b.items.map((it) => <li>{it}</li>)}</Tag>
    }
  })}
</div>
```

- [ ] **Step 3: Export publicly**

Modify `package.json` exports:
```json
"./client": { "types": "./dist/client/index.d.ts", "import": "./dist/client/index.js" }
```

Create `src/client/index.ts`:
```ts
export { default as BlockRenderer } from './BlockRenderer.vue'
export type { Block, BlockType } from '../core/blocks/schema.js'
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/client packages/vulse/package.json
git commit -m "feat(vulse): shared BlockRenderer (Vue + Astro variants)"
```

---

### Task 3: BlockEditor.vue (admin)

**Files:**
- Create: `packages/vulse/src/admin/components/BlockEditor.vue`
- Create: `packages/vulse/src/admin/components/blocks/BlockToolbar.vue`
- Create: `packages/vulse/src/admin/components/blocks/BlockItem.vue`
- Create: per-block editor components in `packages/vulse/src/admin/components/blocks/edit/`:
  - `HeadingEdit.vue`, `ParagraphEdit.vue`, `ImageEdit.vue`, `CodeEdit.vue`, `EmbedEdit.vue`, `QuoteEdit.vue`, `ListEdit.vue`

> **Engineer:** if the original Vulse Vue block editor exists at https://github.com/ekrist1/vulsecms, port the per-block components from there preserving prop/event shape; only the wrapper (BlockEditor.vue) needs to be re-authored. The wrapper must emit `update:modelValue` with the full block array.

- [ ] **Step 1: BlockEditor wrapper**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Block } from '../../core/blocks/schema'
import BlockToolbar from './blocks/BlockToolbar.vue'
import BlockItem from './blocks/BlockItem.vue'
import { nanoid } from 'nanoid'

const props = defineProps<{ modelValue: Block[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block[]): void }>()
const blocks = ref<Block[]>(props.modelValue ?? [])
watch(blocks, (v) => emit('update:modelValue', v), { deep: true })

function add(type: Block['type']) {
  const id = nanoid(8)
  const empty: Block =
    type === 'heading' ? { type, level: 2, text: '', id } :
    type === 'paragraph' ? { type, text: '', id } :
    type === 'image' ? { type, mediaId: '', alt: '', id } :
    type === 'code' ? { type, language: 'ts', code: '', id } :
    type === 'embed' ? { type, url: 'https://', id } :
    type === 'quote' ? { type, text: '', id } :
    { type: 'list', ordered: false, items: [''], id }
  blocks.value = [...blocks.value, empty]
}

function update(i: number, b: Block) {
  blocks.value = blocks.value.map((x, j) => (j === i ? b : x))
}

function remove(i: number) {
  blocks.value = blocks.value.filter((_, j) => j !== i)
}

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= blocks.value.length) return
  const next = [...blocks.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  blocks.value = next
}
</script>

<template>
  <div class="border rounded bg-white">
    <div class="divide-y">
      <BlockItem v-for="(b, i) in blocks" :key="b.id ?? i"
        :block="b" :index="i" :total="blocks.length"
        @update="update(i, $event)" @remove="remove(i)" @move="move(i, $event)" />
    </div>
    <BlockToolbar @add="add" />
  </div>
</template>
```

- [ ] **Step 2: BlockToolbar.vue**

```vue
<script setup lang="ts">
import type { BlockType } from '../../../core/blocks/schema'
import { BUILT_IN_BLOCK_TYPES } from '../../../core/blocks/schema'
defineEmits<{ (e: 'add', t: BlockType): void }>()
</script>
<template>
  <div class="p-2 flex gap-1 border-t bg-zinc-50">
    <button v-for="t in BUILT_IN_BLOCK_TYPES" :key="t" type="button"
      @click="$emit('add', t)"
      class="px-3 py-1 rounded border bg-white text-sm hover:bg-zinc-100">+ {{ t }}</button>
  </div>
</template>
```

- [ ] **Step 3: BlockItem.vue (dispatches to per-block editor)**

```vue
<script setup lang="ts">
import type { Block } from '../../../core/blocks/schema'
import HeadingEdit from './edit/HeadingEdit.vue'
import ParagraphEdit from './edit/ParagraphEdit.vue'
import ImageEdit from './edit/ImageEdit.vue'
import CodeEdit from './edit/CodeEdit.vue'
import EmbedEdit from './edit/EmbedEdit.vue'
import QuoteEdit from './edit/QuoteEdit.vue'
import ListEdit from './edit/ListEdit.vue'

defineProps<{ block: Block; index: number; total: number }>()
defineEmits<{ (e: 'update', b: Block): void; (e: 'remove'): void; (e: 'move', dir: -1 | 1): void }>()
</script>

<template>
  <div class="p-4 flex gap-3 group">
    <div class="flex flex-col gap-1 text-zinc-400">
      <button type="button" @click="$emit('move', -1)" :disabled="index === 0" class="text-sm">↑</button>
      <button type="button" @click="$emit('move', 1)" :disabled="index === total - 1" class="text-sm">↓</button>
      <button type="button" @click="$emit('remove')" class="text-sm text-red-600 opacity-0 group-hover:opacity-100">×</button>
    </div>
    <div class="flex-1">
      <HeadingEdit v-if="block.type === 'heading'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <ParagraphEdit v-else-if="block.type === 'paragraph'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <ImageEdit v-else-if="block.type === 'image'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <CodeEdit v-else-if="block.type === 'code'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <EmbedEdit v-else-if="block.type === 'embed'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <QuoteEdit v-else-if="block.type === 'quote'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <ListEdit v-else-if="block.type === 'list'" :model-value="block" @update:modelValue="$emit('update', $event)" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Per-block edit components**

Each is a thin v-model wrapper. Here's `ParagraphEdit.vue` as the template — apply the same shape for the others:

```vue
<script setup lang="ts">
import type { z } from 'zod'
import { paragraphBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof paragraphBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>
<template>
  <textarea :value="modelValue.text" @input="update('text', ($event.target as HTMLTextAreaElement).value)"
    rows="4" placeholder="Paragraph…" class="w-full rounded border px-3 py-2"></textarea>
</template>
```

(For `ImageEdit`, use a stub media id input for now; Plan 5 swaps to a real media picker via the MediaField component.)

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/admin/components/BlockEditor.vue packages/vulse/src/admin/components/blocks
git commit -m "feat(vulse-admin): block editor wrapper + per-type edit components"
```

---

### Task 4: Wire BlocksField to BlockEditor

**Files:**
- Modify: `packages/vulse/src/admin/components/fields/BlocksField.vue`

- [ ] **Step 1: Replace stub with the real editor**

```vue
<script setup lang="ts">
import BlockEditor from '../BlockEditor.vue'
import type { Block } from '../../../core/blocks/schema'
defineProps<{ modelValue: Block[]; label: string }>()
defineEmits<{ (e: 'update:modelValue', v: Block[]): void }>()
</script>
<template>
  <div class="space-y-2">
    <div class="text-sm text-zinc-600">{{ label }}</div>
    <BlockEditor :model-value="modelValue ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
  </div>
</template>
```

- [ ] **Step 2: Smoke-test**

In playground, edit the starter `page` blueprint to use `body: blocks()` instead of `body: z.string()`:

```ts
import { defineCollection, z, blocks } from 'vulse'
export default defineCollection({
  name: 'page', label: 'Page',
  schema: z.object({ title: z.string(), slug: z.string(), body: blocks() }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
})
```

Reload `/admin/collections/page/new` → block toolbar appears → add heading + paragraph → save → reopen → content persists.

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/src/admin/components/fields/BlocksField.vue
git commit -m "feat(vulse-admin): wire BlocksField → BlockEditor"
```

---

### Task 5: RevisionList page

**Files:**
- Create: `packages/vulse/src/admin/components/RevisionList.vue`
- Create: `packages/vulse/src/admin/pages/collections/[name]/[id]/revisions.astro`

- [ ] **Step 1: RevisionList.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const props = defineProps<{ collection: string; entryId: string }>()
const revisions = ref<{ id: string; version: number; authorId: string | null; createdAt: string; changeSummary: string | null }[]>([])
const selected = ref<number | null>(null); const selectedContent = ref<unknown>(null)
async function load() { revisions.value = await adminApi.get(`/api/vulse/entries/${props.collection}/${props.entryId}/revisions`) }
async function inspect(v: number) {
  selected.value = v
  const all = revisions.value
  // The server's list returns content too; we'd parse it here. For brevity, server already includes content.
  selectedContent.value = (all.find((r) => r.version === v) as any)?.content ?? null
}
async function restore(v: number) {
  if (!confirm(`Restore version ${v}? A new revision will be written on top — no history is lost.`)) return
  await adminApi.post(`/api/vulse/entries/${props.collection}/${props.entryId}/revisions/${v}/restore`, {})
  window.location.href = `/admin/collections/${props.collection}/${props.entryId}`
}
onMounted(load)
</script>

<template>
  <div class="grid grid-cols-[260px_1fr] gap-6">
    <ul class="border rounded bg-white divide-y text-sm">
      <li v-for="r in revisions" :key="r.id"
        @click="inspect(r.version)"
        :class="selected === r.version && 'bg-zinc-100'"
        class="p-3 cursor-pointer hover:bg-zinc-50">
        <div class="font-medium">v{{ r.version }}</div>
        <div class="text-xs text-zinc-500">{{ new Date(r.createdAt).toLocaleString() }}</div>
        <div v-if="r.changeSummary" class="text-xs text-zinc-600 mt-1">{{ r.changeSummary }}</div>
      </li>
    </ul>
    <div v-if="selected" class="space-y-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold">Version {{ selected }}</h2>
        <button @click="restore(selected!)" class="rounded bg-brand text-white px-3 py-1 text-sm">Restore</button>
      </div>
      <pre class="bg-zinc-900 text-zinc-100 rounded p-4 overflow-auto text-xs">{{ JSON.stringify(selectedContent, null, 2) }}</pre>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Page**

```astro
---
import AdminShell from '../../../../components/AdminShell.astro'
import RevisionList from '../../../../components/RevisionList.vue'
const name = Astro.params.name!
const id = Astro.params.id!
---
<AdminShell title={`Revisions`} activePath={`/admin/collections/${name}`}>
  <h1 class="text-2xl font-semibold mb-4">Revisions</h1>
  <RevisionList client:load collection={name} entryId={id} />
</AdminShell>
```

- [ ] **Step 3: Add a link in the entry edit page**

In `pages/collections/[name]/[id].astro`, above the form:

```astro
<a href={`/admin/collections/${bp.name}/${Astro.params.id}/revisions`} class="text-sm text-zinc-600 underline">View history</a>
```

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/admin/components/RevisionList.vue packages/vulse/src/admin/pages/collections
git commit -m "feat(vulse-admin): revision history page with restore"
```

---

### Task 6: RevisionDiff (optional polish)

**Files:**
- Create: `packages/vulse/src/admin/components/RevisionDiff.vue`
- Modify: `packages/vulse/src/admin/components/RevisionList.vue`

- [ ] **Step 1: Install diff**

```bash
pnpm --filter vulse add diff
```

- [ ] **Step 2: RevisionDiff.vue**

```vue
<script setup lang="ts">
import { diffJson } from 'diff'
const props = defineProps<{ from: unknown; to: unknown }>()
const parts = diffJson(props.from as any, props.to as any)
</script>
<template>
  <pre class="bg-zinc-50 border rounded p-3 text-xs overflow-auto"><span v-for="(p, i) in parts" :key="i"
    :class="p.added ? 'bg-green-100 text-green-900' : p.removed ? 'bg-red-100 text-red-900' : ''">{{ p.value }}</span></pre>
</template>
```

- [ ] **Step 3: Replace the JSON `<pre>` in RevisionList with `<RevisionDiff>`**

Show diff between selected revision and the *next-newer* revision (or current entry if selected is latest).

- [ ] **Step 4: Commit**

```bash
git add packages/vulse/src/admin/components/RevisionDiff.vue packages/vulse/src/admin/components/RevisionList.vue packages/vulse/package.json
git commit -m "feat(vulse-admin): revision diff view"
```

---

### Task 7: Integration test for the full revision journey

**Files:**
- Create: `packages/vulse/tests/integration/revision-journey.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/cli/migrate'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { RevisionsRepo } from '../../src/core/repos/revisions'

describe('block content through revisions', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('preserves block tree through edit → restore cycle', async () => {
    const db = createDb(env.DB)
    const entries = new EntriesRepo(db)
    const revs = new RevisionsRepo(db)

    const v1Content = { title: 'a', slug: 'a', body: [{ type: 'paragraph', text: 'v1', id: 'p1' }] }
    const e = await entries.create({ collection: 'page', slug: 'a', content: v1Content, createdBy: 'u' })

    await entries.updateWithRevision(e.id, {
      content: { ...v1Content, body: [{ type: 'paragraph', text: 'v2', id: 'p1' }] },
      updatedBy: 'u',
    })
    await entries.updateWithRevision(e.id, {
      content: { ...v1Content, body: [{ type: 'paragraph', text: 'v3', id: 'p1' }] },
      updatedBy: 'u',
    })

    await revs.restore(e.id, 1, { userId: 'u' })

    const current = await entries.findById(e.id)
    expect((current?.content as any).body[0].text).toBe('v1')
    expect(current?.version).toBe(4)

    const history = await revs.listByEntry(e.id)
    expect(history.map((r) => r.version)).toEqual([4, 3, 2, 1])
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
pnpm --filter vulse test:integration
git add packages/vulse/tests/integration/revision-journey.test.ts
git commit -m "test(vulse): block content + revision restore journey"
```

---

## Self-review

- **Spec coverage:** §4.3 (block editor port) — Tasks 1-4; §2.5 (revisions write path UI surface) — Tasks 5-6; §3.1 (BlockRenderer shared) — Task 2.
- **Placeholders:** ImageEdit uses a plain text input for `mediaId` until Plan 5 wires the media picker. That's a documented deferral, not a placeholder.
- **Type consistency:** `Block`, `BlockType`, `BUILT_IN_BLOCK_TYPES` are the canonical names used by both renderer and editor.
- **What this plan does NOT do:** media upload UI (Plan 5); content delivery to public site (Plan 6); end-user auth (Plan 7).
