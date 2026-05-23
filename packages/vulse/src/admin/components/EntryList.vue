<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api.js'
import CollectionTree from './CollectionTree.vue'

const props = defineProps<{
  collection: string
  label: string
  columns: string[]
  tree?: boolean
}>()

const rows = ref<{ id: string; status: string; slug?: string; hasUnpublishedChanges?: boolean; content?: Record<string, unknown> }[]>([])
const loading = ref(true)

onMounted(async () => {
  if (props.tree) {
    loading.value = false
    return
  }
  try {
    rows.value = await adminApi.get(`/api/vulse/entries/${props.collection}`)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-zinc-900">{{ label }}</h1>
      <a
        :href="`/admin/collections/${collection}/new`"
        class="vulse-button-primary rounded px-4 py-2 text-sm font-medium"
      >
        + New
      </a>
    </div>

    <CollectionTree v-if="tree" :handle="collection" />

    <div v-else-if="loading" class="text-sm text-zinc-500">Loading…</div>

    <div
      v-else-if="rows.length === 0"
      class="rounded border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500"
    >
      No entries yet. Create your first one with “+ New”.
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
                :href="`/admin/collections/${collection}/${r.id}`"
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
