<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { adminApi, AdminApiError } from '../client/api.js'

const props = defineProps<{
  collection: string
  entryId?: string
  previewPath: string
  slug: string
  content: Record<string, unknown>
  entryLocale?: string
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeSrc = ref('')
const sessionId = ref<string | null>(null)
const lastSlug = ref(props.slug)
const error = ref<string | null>(null)
const starting = ref(false)

let updateTimer: ReturnType<typeof setTimeout> | null = null

function buildPreviewUrl(slug: string): string {
  const path = props.previewPath.replace('{slug}', encodeURIComponent(slug))
  const url = new URL(path, window.location.origin)
  if (sessionId.value) url.searchParams.set('vulse_live_preview', sessionId.value)
  return url.toString()
}

function postPreviewUpdated() {
  if (!sessionId.value) return
  iframeRef.value?.contentWindow?.postMessage(
    { name: 'vulse.preview.updated', token: sessionId.value },
    window.location.origin,
  )
}

async function startSession() {
  starting.value = true
  error.value = null
  try {
    const created = await adminApi.post<{ id: string; previewUrl: string }>(
      '/api/vulse/preview/sessions',
      {
        collection: props.collection,
        entryId: props.entryId ?? null,
        slug: props.slug,
        content: props.content,
        ...(props.entryLocale ? { locale: props.entryLocale } : {}),
      },
    )
    sessionId.value = created.id
    iframeSrc.value = created.previewUrl
    lastSlug.value = props.slug
    await updateSession()
  } catch (e) {
    if (e instanceof AdminApiError) error.value = e.message
    else error.value = 'Failed to start live preview'
  } finally {
    starting.value = false
  }
}

async function updateSession() {
  if (!sessionId.value) return
  try {
    await adminApi.put(`/api/vulse/preview/sessions/${sessionId.value}`, {
      content: props.content,
      slug: props.slug,
      ...(props.entryLocale ? { locale: props.entryLocale } : {}),
    })
    if (props.slug !== lastSlug.value) {
      iframeSrc.value = buildPreviewUrl(props.slug)
      lastSlug.value = props.slug
    }
    postPreviewUpdated()
    error.value = null
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 403 || e.status === 404)) {
      sessionId.value = null
      iframeSrc.value = ''
      await startSession()
      return
    }
    if (e instanceof AdminApiError) error.value = e.message
    else error.value = 'Failed to update live preview'
  }
}

function scheduleUpdate() {
  if (!sessionId.value) return
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => {
    void updateSession()
  }, 100)
}

const showIframe = computed(() => !!iframeSrc.value && !starting.value && !error.value)

watch(
  () => ({ slug: props.slug, content: props.content }),
  () => scheduleUpdate(),
  { deep: true },
)

onMounted(async () => {
  await startSession()
})

onBeforeUnmount(() => {
  if (updateTimer) clearTimeout(updateTimer)
  const id = sessionId.value
  if (!id) return
  void adminApi.delete(`/api/vulse/preview/sessions/${id}`).catch(() => {})
})
</script>

<template>
  <aside class="flex min-h-[520px] flex-col rounded border border-zinc-200 bg-white">
    <header class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
      <h2 class="text-sm font-semibold text-zinc-900">Live preview</h2>
      <div class="flex items-center gap-3">
        <button
          v-if="error"
          type="button"
          class="text-sm text-zinc-600 underline hover:text-zinc-900"
          @click="startSession"
        >
          Retry
        </button>
        <a
          v-if="iframeSrc"
          :href="iframeSrc"
          target="_blank"
          rel="noreferrer"
          class="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Open in tab
        </a>
      </div>
    </header>

    <div class="flex flex-1 flex-col">
      <div
        v-if="error"
        class="flex min-h-[480px] flex-1 flex-col items-center justify-center gap-3 bg-red-50 px-6 text-sm text-red-700"
      >
        <p>{{ error }}</p>
        <button
          type="button"
          class="rounded border border-red-300 bg-white px-3 py-1.5 text-sm hover:bg-red-50"
          @click="startSession"
        >
          Restart preview
        </button>
      </div>
      <div
        v-else-if="starting || !iframeSrc"
        class="flex min-h-[480px] flex-1 items-center justify-center bg-zinc-50 px-6 text-sm text-zinc-500"
      >
        Starting preview session…
      </div>
      <iframe
        v-else-if="showIframe"
        ref="iframeRef"
        :src="iframeSrc"
        class="min-h-[480px] w-full flex-1 border-0 bg-white"
      />
    </div>
  </aside>
</template>
