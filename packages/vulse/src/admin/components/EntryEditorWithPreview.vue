<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { FieldDescriptor } from '../client/form-from-zod.js'
import { resolveActiveLocale } from '../client/active-locale.js'
import { isLivePreviewEnabled } from '../client/live-preview-enabled.js'
import EntryForm from './EntryForm.vue'
import LivePreviewPanel from './LivePreviewPanel.vue'

const PREVIEW_VISIBLE_KEY = 'vulse:live-preview-visible'

const props = defineProps<{
  collection: string
  entryId?: string
  fields: FieldDescriptor[]
  initial: Record<string, unknown>
  titleField?: string
  draftsEnabled?: boolean
  seoEnabled?: boolean
  seoMapping?: import('../../core/blueprints/seo.js').SeoFieldMapping
  tree?: boolean
  parentId?: string | null
  hasUnpublishedChanges?: boolean
  previewPath: string
  /** When false, hides live preview for this collection. Avoid prop name `enabled` (Astro/HTML coercion). */
  livePreviewAllowed?: boolean
  /** Active locale from the server. Avoid prop name `locale` (Astro/HTML coercion). */
  entryLocale?: string
  defaultLocale?: string
  supportedLocales?: string[]
  existingLocales?: string[]
}>()

const allowLivePreview = computed(() => isLivePreviewEnabled(props.livePreviewAllowed))

const activeLocale = computed(() =>
  resolveActiveLocale(props.supportedLocales, props.entryLocale, props.defaultLocale),
)

const previewContent = ref<Record<string, unknown>>({ ...props.initial })
delete previewContent.value.slug
delete previewContent.value.status
delete previewContent.value.hasUnpublishedChanges

const previewSlug = ref(String(props.initial?.slug ?? ''))
const previewVisible = ref(true)

onMounted(() => {
  if (!allowLivePreview.value) return
  try {
    const stored = localStorage.getItem(PREVIEW_VISIBLE_KEY)
    if (stored === 'false') previewVisible.value = false
  } catch {
    // ignore storage errors
  }
})

function onPreviewChange(payload: { content: Record<string, unknown>; slug: string }) {
  previewContent.value = payload.content
  previewSlug.value = payload.slug
}

function togglePreview() {
  previewVisible.value = !previewVisible.value
  try {
    localStorage.setItem(PREVIEW_VISIBLE_KEY, String(previewVisible.value))
  } catch {
    // ignore storage errors
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="allowLivePreview"
      class="flex items-center justify-end gap-2"
    >
      <button
        type="button"
        class="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        @click="togglePreview"
      >
        {{ previewVisible ? 'Hide live preview' : 'Show live preview' }}
      </button>
    </div>

    <p
      v-else
      class="rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
    >
      Live preview is disabled for this collection. Use the Preview button above to view saved drafts in a new tab.
    </p>

    <div
      class="grid gap-8"
      :class="previewVisible && allowLivePreview ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'"
    >
      <EntryForm
        :key="`${entryId ?? 'new'}:${activeLocale}`"
        :collection="collection"
        :entry-id="entryId"
        :fields="fields"
        :initial="initial"
        :title-field="titleField"
        :drafts-enabled="draftsEnabled"
        :seo-enabled="seoEnabled"
        :seo-mapping="seoMapping"
        :tree="tree"
        :parent-id="parentId"
        :has-unpublished-changes="hasUnpublishedChanges"
        :wide="!previewVisible || !allowLivePreview"
        :entry-locale="entryLocale"
        :default-locale="defaultLocale"
        :supported-locales="supportedLocales"
        :existing-locales="existingLocales"
        @preview-change="onPreviewChange"
      />
      <LivePreviewPanel
        v-if="previewVisible && allowLivePreview"
        :key="(entryId ?? previewSlug) + ':' + activeLocale"
        :collection="collection"
        :entry-id="entryId"
        :preview-path="previewPath"
        :slug="previewSlug"
        :content="previewContent"
        :entry-locale="activeLocale"
      />
    </div>
  </div>
</template>
