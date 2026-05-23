<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { adminApi, AdminApiError } from '../client/api.js'
import type { FieldDescriptor } from '../client/form-from-zod.js'
import { normalizeSlug } from '../../core/slug.js'
import FieldRenderer from './fields/FieldRenderer.vue'
import EntryStatusBadge from './EntryStatusBadge.vue'

const props = defineProps<{
  collection: string
  entryId?: string
  fields: FieldDescriptor[]
  initial: Record<string, unknown>
  titleField?: string
  draftsEnabled?: boolean
  tree?: boolean
  parentId?: string | null
  hasUnpublishedChanges?: boolean
}>()

const emit = defineEmits<{
  previewChange: [{ content: Record<string, unknown>; slug: string }]
}>()

const content = ref<Record<string, unknown>>({ ...props.initial })
delete content.value.slug
delete content.value.status
delete content.value.hasUnpublishedChanges

const slug = ref<string>(String(props.initial?.slug ?? ''))
const slugTouched = ref(!!props.entryId)
const slugExpanded = ref(false)
const slugError = ref<string | null>(null)
const slugNotice = ref<string | null>(null)
const status = ref<'draft' | 'published'>((props.initial?.status as 'draft' | 'published') ?? 'draft')
const hasChanges = ref(props.hasUnpublishedChanges ?? false)
const error = ref<string | null>(null)
const saving = ref(false)
const lastAction = ref<'draft' | 'publish' | 'save'>('save')

function emitPreview() {
  emit('previewChange', {
    content: { ...content.value },
    slug: slug.value,
  })
}

const titleFieldLabel = computed(() => {
  if (!props.titleField) return 'title'
  const field = props.fields.find((f) => f.path === props.titleField)
  return field?.label ?? props.titleField
})

function applyApiError(e: AdminApiError) {
  slugError.value = null
  error.value = null
  const details = e.details as {
    field?: string
    issues?: Array<{ path?: (string | number)[]; message?: string }>
  } | undefined
  const slugIssue = details?.field === 'slug'
    || details?.issues?.find((issue) => issue.path?.[0] === 'slug')
  if (slugIssue) {
    slugError.value = slugIssue === true ? e.message : (slugIssue.message ?? e.message)
    slugExpanded.value = true
    return
  }
  error.value = e.message
}

function syncSlugFromResponse(nextSlug: string, requestedSlug: string) {
  if (nextSlug === requestedSlug) return
  slug.value = nextSlug
  slugNotice.value = `URL slug was adjusted to "${nextSlug}" because "${requestedSlug}" is already in use.`
  slugExpanded.value = true
}

function onFieldUpdate(path: string, value: unknown) {
  content.value = { ...content.value, [path]: value }
  if (props.titleField && path === props.titleField && !slugTouched.value && typeof value === 'string') {
    slug.value = normalizeSlug(value)
  }
  emitPreview()
}

function resetSlugFromTitle() {
  if (!props.titleField) return
  const raw = content.value[props.titleField]
  if (typeof raw === 'string') slug.value = normalizeSlug(raw)
  slugTouched.value = false
  slugError.value = null
}

function ensureSlugBeforeSave(): boolean {
  slugError.value = null
  if (!slug.value && props.titleField) {
    const raw = content.value[props.titleField]
    if (typeof raw === 'string' && raw.trim()) {
      slug.value = normalizeSlug(raw)
    }
  }
  if (!slug.value.trim()) {
    slugError.value = `Enter a ${titleFieldLabel.value.toLowerCase()} to generate a URL slug.`
    slugExpanded.value = true
    return false
  }
  return true
}

async function save(publish = false) {
  if (!ensureSlugBeforeSave()) return
  saving.value = true
  error.value = null
  slugError.value = null
  slugNotice.value = null
  lastAction.value = props.draftsEnabled ? (publish ? 'publish' : 'draft') : 'save'
  const requestedSlug = slug.value
  try {
    const body: Record<string, unknown> = {
      content: content.value,
      slug: slug.value,
    }
    if (props.draftsEnabled) {
      body.publish = publish
    } else {
      body.status = status.value
    }
    if (props.entryId) {
      const updated = await adminApi.put<{ slug: string }>(`/api/vulse/entries/${props.collection}/${props.entryId}`, body)
      syncSlugFromResponse(updated.slug, requestedSlug)
      hasChanges.value = props.draftsEnabled && !publish
      if (publish) status.value = 'published'
    } else {
      if (props.tree && props.parentId) body.parentId = props.parentId
      if (props.draftsEnabled) body.publish = publish
      else body.status = status.value
      const created = await adminApi.post<{ id: string; slug: string }>(`/api/vulse/entries/${props.collection}`, body)
      syncSlugFromResponse(created.slug, requestedSlug)
      window.location.href = `/admin/collections/${props.collection}/${created.id}`
      return
    }
  } catch (e) {
    if (e instanceof AdminApiError) applyApiError(e)
    else error.value = 'Save failed'
  } finally {
    saving.value = false
  }
}

async function publishNow() {
  if (!props.entryId || !props.draftsEnabled) return
  saving.value = true
  error.value = null
  try {
    await adminApi.post(`/api/vulse/entries/${props.collection}/${props.entryId}/publish`)
    hasChanges.value = false
    status.value = 'published'
  } catch (e) {
    if (e instanceof AdminApiError) applyApiError(e)
    else error.value = 'Publish failed'
  } finally {
    saving.value = false
  }
}

watch(slug, () => emitPreview())
onMounted(() => emitPreview())
</script>

<template>
  <form class="vulse-form max-w-3xl space-y-5" @submit.prevent="draftsEnabled ? save(false) : save()">
    <div v-if="entryId" class="flex items-center gap-3">
      <h2 class="text-lg font-semibold text-zinc-900">Entry details</h2>
      <EntryStatusBadge v-if="draftsEnabled" :status="status" :has-unpublished-changes="hasChanges" />
    </div>

    <FieldRenderer
      v-for="f in fields"
      :key="f.path"
      :field="f"
      :model-value="content[f.path]"
      @update:modelValue="onFieldUpdate(f.path, $event)"
    />

    <details
      class="rounded border border-zinc-200 bg-zinc-50 text-sm"
      :open="slugExpanded"
      @toggle="slugExpanded = ($event.target as HTMLDetailsElement).open"
    >
      <summary class="cursor-pointer select-none px-3 py-2.5 text-zinc-600">
        <span class="font-medium">URL slug</span>
        <span class="ml-2 font-mono text-zinc-500">{{ slug || '…' }}</span>
        <span v-if="titleField && !slugTouched" class="ml-2 text-xs text-zinc-400">
          auto-generated from {{ titleFieldLabel.toLowerCase() }}
        </span>
      </summary>
      <div class="space-y-2 border-t border-zinc-200 px-3 py-3">
        <p class="text-xs text-zinc-500">
          The slug is used in the page URL. It is usually generated from the {{ titleFieldLabel.toLowerCase() }}.
        </p>
        <label class="block">
          <span class="vulse-label text-zinc-500">Slug</span>
          <input
            v-model="slug"
            class="vulse-input mt-1 bg-white font-mono text-zinc-700"
            :class="slugError && 'border-red-400'"
            @input="slugTouched = true; slugError = null; slugNotice = null"
          />
        </label>
        <p v-if="slugError" class="text-xs text-red-600">{{ slugError }}</p>
        <p v-else-if="slugNotice" class="text-xs text-amber-700">{{ slugNotice }}</p>
        <button
          v-if="titleField && slugTouched"
          type="button"
          class="text-xs text-zinc-600 underline hover:text-zinc-900"
          @click="resetSlugFromTitle"
        >
          Reset from {{ titleFieldLabel.toLowerCase() }}
        </button>
      </div>
    </details>

    <label v-if="!draftsEnabled" class="block">
      <span class="vulse-label">Status</span>
      <select v-model="status" class="vulse-input mt-1">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
    </label>

    <p v-if="error" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>

    <div class="flex flex-wrap items-center gap-2 pt-2">
      <template v-if="draftsEnabled">
        <button
          type="submit"
          class="vulse-button-primary rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          :disabled="saving"
        >
          {{ saving && lastAction === 'draft' ? 'Saving…' : 'Save draft' }}
        </button>
        <button
          type="button"
          class="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          :disabled="saving"
          @click="save(true)"
        >
          {{ saving && lastAction === 'publish' ? 'Saving…' : 'Save & publish' }}
        </button>
        <button
          v-if="entryId && (hasChanges || status === 'draft')"
          type="button"
          class="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          :disabled="saving"
          @click="publishNow"
        >
          Publish
        </button>
      </template>
      <button
        v-else
        type="submit"
        class="vulse-button-primary rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        :disabled="saving"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <a
        :href="`/admin/collections/${collection}`"
        class="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Cancel
      </a>
    </div>
  </form>
</template>
