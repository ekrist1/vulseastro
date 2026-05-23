<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'
import type { SetDefinition } from '../../core/sets/definition.js'

const sets = ref<SetDefinition[]>([])

onMounted(async () => {
  sets.value = await adminApi.get<SetDefinition[]>('/api/vulse/sets')
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">Sets</h1>
      <a href="/admin/settings/sets/new" class="vulse-button-primary rounded-lg px-4 py-2 text-sm font-medium">+ New set</a>
    </div>
    <div class="rounded-xl border border-zinc-200 bg-white">
      <a
        v-for="s in sets"
        :key="s.handle"
        :href="`/admin/settings/sets/${s.handle}`"
        class="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-sm last:border-0 hover:bg-zinc-50"
      >
        <span class="font-medium">{{ s.label }}</span>
        <span class="font-mono text-xs text-zinc-500">{{ s.handle }}</span>
      </a>
      <p v-if="sets.length === 0" class="px-4 py-6 text-sm text-zinc-500">No sets yet.</p>
    </div>
  </div>
</template>
