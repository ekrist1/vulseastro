<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'

interface GlobalSetListItem {
  handle: string
  label: string
  fieldCount: number
}

const sets = ref<GlobalSetListItem[]>([])
const loading = ref(true)

onMounted(async () => {
  sets.value = await adminApi.get<GlobalSetListItem[]>('/api/vulse/globals')
  loading.value = false
})

async function destroy(handle: string) {
  if (!confirm(`Delete global set "${handle}"?`)) return
  await adminApi.delete(`/api/vulse/globals/${handle}`)
  sets.value = sets.value.filter((s) => s.handle !== handle)
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Globals</h1>
        <p class="mt-1 text-sm text-zinc-500">Site-wide content available on every page.</p>
      </div>
      <a href="/admin/settings/globals/new" class="vulse-button-primary rounded-lg px-4 py-2 text-sm font-medium">+ New global set</a>
    </div>

    <p v-if="loading" class="text-sm text-zinc-500">Loading…</p>
    <div v-else class="rounded-xl border border-zinc-200 bg-white">
      <div
        v-for="s in sets"
        :key="s.handle"
        class="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-sm last:border-0"
      >
        <div>
          <div class="font-medium">{{ s.label }}</div>
          <div class="font-mono text-xs text-zinc-500">{{ s.handle }} · {{ s.fieldCount }} field{{ s.fieldCount === 1 ? '' : 's' }}</div>
        </div>
        <div class="flex items-center gap-3">
          <a :href="`/admin/settings/globals/${s.handle}`" class="text-zinc-700 hover:underline">Edit</a>
          <button type="button" class="text-red-600 hover:underline" @click="destroy(s.handle)">Delete</button>
        </div>
      </div>
      <p v-if="sets.length === 0" class="px-4 py-6 text-sm text-zinc-500">No global sets yet.</p>
    </div>
  </div>
</template>
