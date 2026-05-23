<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'

const props = defineProps<{ formHandle: string }>()

interface SubmissionRow {
  id: string
  payload: Record<string, unknown>
  status: string
  createdAt: string
}

const rows = ref<SubmissionRow[]>([])
const selected = ref<Set<string>>(new Set())
const loading = ref(true)

const previewField = computed(() => {
  const first = rows.value[0]
  if (!first) return null
  const entry = Object.entries(first.payload).find(([k]) => !k.startsWith('_'))
  return entry?.[1]
})

onMounted(async () => {
  rows.value = await adminApi.get<SubmissionRow[]>(`/api/vulse/forms/${props.formHandle}/submissions`)
  loading.value = false
})

function toggle(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}

async function bulkDelete() {
  if (selected.value.size === 0 || !confirm(`Delete ${selected.value.size} submission(s)?`)) return
  await adminApi.post(`/api/vulse/forms/${props.formHandle}/submissions/delete`, { ids: [...selected.value] })
  rows.value = rows.value.filter((r) => !selected.value.has(r.id))
  selected.value.clear()
}

function exportCsv() {
  if (rows.value.length === 0) return
  const keys = [...new Set(rows.value.flatMap((r) => Object.keys(r.payload)))]
  const lines = [keys.join(',')]
  for (const r of rows.value) {
    lines.push(keys.map((k) => JSON.stringify(r.payload[k] ?? '')).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.formHandle}-submissions.csv`
  a.click()
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Submissions</h1>
      <div class="flex gap-2">
        <button type="button" class="rounded border border-zinc-300 px-3 py-1 text-sm" @click="exportCsv">Export CSV</button>
        <button type="button" class="rounded border border-red-200 px-3 py-1 text-sm text-red-700" :disabled="selected.size === 0" @click="bulkDelete">Delete selected</button>
      </div>
    </div>
    <p v-if="loading" class="text-sm text-zinc-500">Loading…</p>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-200 text-left text-zinc-500">
          <th class="py-2 pr-2"></th>
          <th class="py-2 pr-4">Preview</th>
          <th class="py-2 pr-4">Status</th>
          <th class="py-2 pr-4">Created</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="border-b border-zinc-100">
          <td class="py-2 pr-2"><input type="checkbox" :checked="selected.has(r.id)" @change="toggle(r.id)" /></td>
          <td class="py-2 pr-4 max-w-xs truncate">{{ Object.values(r.payload)[0] }}</td>
          <td class="py-2 pr-4"><span class="rounded bg-zinc-100 px-2 py-0.5 text-xs">{{ r.status }}</span></td>
          <td class="py-2 pr-4 text-xs text-zinc-500">{{ new Date(r.createdAt).toLocaleString() }}</td>
          <td class="py-2"><a :href="`/admin/forms/${formHandle}/submissions/${r.id}`" class="hover:underline">View</a></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!loading && rows.length === 0" class="text-sm text-zinc-500">No submissions yet.</p>
  </div>
</template>
