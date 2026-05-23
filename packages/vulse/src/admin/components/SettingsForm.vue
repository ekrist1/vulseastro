<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const values = ref<Record<string, string>>({})
async function load() {
  const all = await adminApi.get<Record<string, unknown>>('/api/vulse/settings')
  values.value = {
    siteName: String(all.siteName ?? ''),
    deployHookUrl: String(all.deployHookUrl ?? ''),
  }
}
async function save(key: string, raw: string) {
  await adminApi.put(`/api/vulse/settings/${key}`, { value: raw })
}
onMounted(load)
</script>

<template>
  <div class="space-y-4 max-w-md">
    <label class="block">
      <span class="text-sm text-zinc-600">Site name</span>
      <input v-model="values.siteName" @change="save('siteName', values.siteName)" class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <label class="block">
      <span class="text-sm text-zinc-600">Deploy hook URL (CF Pages rebuild webhook)</span>
      <input v-model="values.deployHookUrl" @change="save('deployHookUrl', values.deployHookUrl)" class="mt-1 w-full rounded border px-3 py-2" />
    </label>
  </div>
</template>
