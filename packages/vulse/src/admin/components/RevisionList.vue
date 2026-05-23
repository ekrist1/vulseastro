<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { adminApi } from '../client/api'
import RevisionDiff from './RevisionDiff.vue'

interface RevisionRow {
  id: string
  version: number
  authorId: string | null
  createdAt: string
  changeSummary: string | null
  content: unknown
}

const props = defineProps<{ collection: string; entryId: string }>()
const revisions = ref<RevisionRow[]>([])
const selected = ref<number | null>(null)

const selectedContent = computed(() => {
  if (selected.value === null) return null
  return revisions.value.find((r) => r.version === selected.value)?.content ?? null
})

const newerContent = computed(() => {
  if (selected.value === null) return null
  const newer = revisions.value
    .filter((r) => r.version > selected.value!)
    .sort((a, b) => a.version - b.version)[0]
  return newer?.content ?? null
})

async function load() {
  revisions.value = await adminApi.get<RevisionRow[]>(
    `/api/vulse/entries/${props.collection}/${props.entryId}/revisions`,
  )
  if (revisions.value.length && selected.value === null) {
    selected.value = revisions.value[0].version
  }
}

function inspect(v: number) {
  selected.value = v
}

async function restore(v: number) {
  if (!confirm(`Restore version ${v}? A new revision will be written on top — no history is lost.`)) return
  await adminApi.post(
    `/api/vulse/entries/${props.collection}/${props.entryId}/revisions/${v}/restore`,
    {},
  )
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
    <div v-if="selected !== null && selectedContent !== null" class="space-y-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold">Version {{ selected }}</h2>
        <button @click="restore(selected!)" class="rounded bg-brand text-white px-3 py-1 text-sm">Restore</button>
      </div>
      <RevisionDiff v-if="newerContent !== null" :from="selectedContent" :to="newerContent" />
      <pre v-else class="bg-zinc-900 text-zinc-100 rounded p-4 overflow-auto text-xs">{{ JSON.stringify(selectedContent, null, 2) }}</pre>
    </div>
  </div>
</template>
