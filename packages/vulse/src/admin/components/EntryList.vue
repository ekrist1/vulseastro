<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const props = defineProps<{ collection: string; columns: string[] }>()
const rows = ref<{ id: string; status: string; content?: Record<string, unknown> }[]>([])
onMounted(async () => { rows.value = await adminApi.get(`/api/vulse/entries/${props.collection}`) })
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-semibold">{{ collection }}</h1>
      <a :href="`/admin/collections/${collection}/new`" class="rounded bg-brand text-white px-4 py-2 text-sm">New</a>
    </div>
    <table class="w-full bg-white border rounded">
      <thead><tr class="border-b text-left text-sm">
        <th v-for="c in columns" :key="c" class="p-3">{{ c }}</th>
        <th class="p-3">Status</th>
      </tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="border-b text-sm">
          <td v-for="c in columns" :key="c" class="p-3">
            <a :href="`/admin/collections/${collection}/${r.id}`" class="text-brand underline-offset-2 hover:underline">
              {{ r.content?.[c] ?? '—' }}
            </a>
          </td>
          <td class="p-3">{{ r.status }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
