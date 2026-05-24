<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { adminApi } from '../client/api.js'
import CollectionTree from './CollectionTree.vue'

const props = defineProps<{
  collection: string
  label: string
  columns: string[]
  tree?: boolean
  locale?: string
  supportedLocales?: string[]
}>()

const rows = ref<{ id: string; status: string; slug?: string; hasUnpublishedChanges?: boolean; content?: Record<string, unknown> }[]>([])
const loading = ref(true)
const activeLocale = ref(props.locale ?? 'default')
const knownLocales = computed(() => props.supportedLocales ?? [activeLocale.value])

async function load() {
  loading.value = true
  try {
    const qs = new URLSearchParams()
    qs.set('locale', activeLocale.value)
    rows.value = await adminApi.get(`/api/vulse/entries/${props.collection}?${qs.toString()}`)
  } finally {
    loading.value = false
  }
}

function switchLocale(next: string) {
  if (next === activeLocale.value) return
  activeLocale.value = next
  const params = new URLSearchParams(window.location.search)
  params.set('locale', next)
  history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

onMounted(() => {
  if (!props.tree) void load()
  else loading.value = false
})

watch(activeLocale, () => {
  if (!props.tree) void load()
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-zinc-900">{{ label }}</h1>
      <div class="flex items-center gap-3">
        <div v-if="knownLocales.length > 1" class="flex items-center gap-2 text-sm">
          <span class="text-zinc-500">Locale</span>
          <select
            :value="activeLocale"
            class="rounded border border-zinc-300 bg-white px-2 py-1 font-mono"
            @change="switchLocale(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="loc in knownLocales" :key="loc" :value="loc">{{ loc }}</option>
          </select>
        </div>
        <a
          :href="`/admin/collections/${collection}/new?locale=${encodeURIComponent(activeLocale)}`"
          class="vulse-button-primary rounded px-4 py-2 text-sm font-medium"
        >
          + New
        </a>
      </div>
    </div>

    <CollectionTree v-if="tree" :handle="collection" :locale="activeLocale" />

    <div v-else-if="loading" class="text-sm text-zinc-500">Loading…</div>

    <div
      v-else-if="rows.length === 0"
      class="rounded border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500"
    >
      No <code>{{ activeLocale }}</code> entries yet. Create your first one with “+ New”.
    </div>

    <div v-else class="overflow-hidden rounded border border-zinc-200 bg-white">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th v-for="c in columns" :key="c" class="p-3 font-medium text-zinc-600">{{ c }}</th>
            <th class="p-3 font-medium text-zinc-600">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
            <td v-for="c in columns" :key="c" class="p-3">
              <a
                :href="`/admin/collections/${collection}/${r.id}?locale=${encodeURIComponent(activeLocale)}`"
                class="font-medium text-zinc-900 hover:underline"
              >
                {{ r.content?.[c] ?? r.slug ?? '—' }}
              </a>
            </td>
            <td class="p-3">
              <span
                class="rounded px-2 py-0.5 text-xs"
                :class="r.status === 'published' ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-700'"
              >
                {{ r.hasUnpublishedChanges ? `${r.status} · changes` : r.status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
