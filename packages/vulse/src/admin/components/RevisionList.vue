<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { adminApi, AdminApiError } from '../client/api'
import { resolveActiveLocale } from '../client/active-locale.js'
import { useToast } from '../composables/toast.js'
import RevisionDiff from './RevisionDiff.vue'

interface RevisionRow {
  id: string
  version: number
  authorId: string | null
  createdAt: string
  changeSummary: string | null
  content: unknown
}

const props = defineProps<{
  collection: string
  entryId: string
  /** Active locale from the server. Avoid prop name `locale` (Astro/HTML coercion). */
  entryLocale?: string
  supportedLocales?: string[]
  defaultLocale?: string
}>()

const toast = useToast()
const revisions = ref<RevisionRow[]>([])
const selected = ref<number | null>(null)

const activeLocale = computed(() =>
  resolveActiveLocale(props.supportedLocales, props.entryLocale, props.defaultLocale),
)

function versionOf(r: RevisionRow): number {
  return Number(r.version)
}

const localeQuery = () => `?locale=${encodeURIComponent(activeLocale.value)}`

const latestVersion = computed(() =>
  revisions.value.reduce((max, r) => Math.max(max, versionOf(r)), 0),
)

const selectedRevision = computed(() =>
  selected.value === null
    ? null
    : revisions.value.find((r) => versionOf(r) === selected.value) ?? null,
)

const selectedContent = computed(() => selectedRevision.value?.content ?? null)

const isCurrentVersion = computed(() =>
  selected.value !== null && selected.value === latestVersion.value,
)

const canRestore = computed(() =>
  selected.value !== null && revisions.value.length > 1 && !isCurrentVersion.value,
)

const newerContent = computed(() => {
  if (selected.value === null) return null
  const newer = revisions.value
    .filter((r) => versionOf(r) > selected.value!)
    .sort((a, b) => versionOf(a) - versionOf(b))[0]
  return newer?.content ?? null
})

async function load() {
  revisions.value = await adminApi.get<RevisionRow[]>(
    `/api/vulse/entries/${props.collection}/${props.entryId}/revisions${localeQuery()}`,
  )
  if (revisions.value.length && selected.value === null) {
    selected.value = versionOf(revisions.value[0]!)
  }
}

function inspect(v: number) {
  selected.value = Number(v)
}

async function restore(v: number) {
  if (!confirm(`Restore version ${v}? A new revision will be written on top — no history is lost.`)) return
  try {
    await adminApi.post(
      `/api/vulse/entries/${props.collection}/${props.entryId}/revisions/${v}/restore${localeQuery()}`,
      {},
    )
    window.location.href = `/admin/collections/${props.collection}/${props.entryId}?locale=${encodeURIComponent(activeLocale.value)}`
  } catch (err) {
    toast.error(err instanceof AdminApiError ? err.message : 'Failed to restore revision')
  }
}

onMounted(load)
</script>

<template>
  <div class="grid grid-cols-[260px_1fr] gap-6">
    <ul class="border rounded bg-white divide-y text-sm min-h-[120px]">
      <li v-if="!revisions.length" class="p-3 text-zinc-500">No revisions yet.</li>
      <li v-for="r in revisions" :key="r.id"
        @click="inspect(r.version)"
        :class="selected === versionOf(r) && 'bg-zinc-100'"
        class="p-3 cursor-pointer hover:bg-zinc-50">
        <div class="flex items-center justify-between gap-2">
          <div class="font-medium">v{{ r.version }}</div>
          <span v-if="versionOf(r) === latestVersion" class="text-xs text-zinc-500">Current</span>
        </div>
        <div class="text-xs text-zinc-500">{{ new Date(r.createdAt).toLocaleString() }}</div>
        <div v-if="r.changeSummary" class="text-xs text-zinc-600 mt-1">{{ r.changeSummary }}</div>
      </li>
    </ul>
    <div v-if="selected !== null" class="space-y-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold">Version {{ selected }}</h2>
        <button
          v-if="canRestore"
          type="button"
          @click="restore(selected!)"
          class="vulse-button-primary rounded px-3 py-1 text-sm font-medium">
          Restore
        </button>
      </div>
      <p v-if="isCurrentVersion && revisions.length > 1" class="text-sm text-zinc-600">
        This is the current version. Select an older version to restore it.
      </p>
      <p v-else-if="revisions.length <= 1" class="text-sm text-zinc-600">
        Only one version exists.
      </p>
      <RevisionDiff v-if="newerContent !== null && selectedContent !== null" :from="selectedContent" :to="newerContent" />
      <pre v-else-if="selectedContent !== null" class="bg-zinc-900 text-zinc-100 rounded p-4 overflow-auto text-xs">{{ JSON.stringify(selectedContent, null, 2) }}</pre>
    </div>
  </div>
</template>
