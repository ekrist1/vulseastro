<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'

interface FormRow {
  handle: string
  label: string
  enabled: boolean
  submissionCount?: number
}

const forms = ref<FormRow[]>([])
const loading = ref(true)

onMounted(async () => {
  forms.value = await adminApi.get<FormRow[]>('/api/vulse/forms')
  loading.value = false
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Forms</h1>
      <a href="/admin/forms/new" class="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">New form</a>
    </div>
    <p v-if="loading" class="text-sm text-zinc-500">Loading…</p>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-200 text-left text-zinc-500">
          <th class="py-2 pr-4">Label</th>
          <th class="py-2 pr-4">Handle</th>
          <th class="py-2 pr-4">Enabled</th>
          <th class="py-2 pr-4">Submissions</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in forms" :key="f.handle" class="border-b border-zinc-100">
          <td class="py-2 pr-4">{{ f.label }}</td>
          <td class="py-2 pr-4 font-mono text-xs">{{ f.handle }}</td>
          <td class="py-2 pr-4">{{ f.enabled ? 'Yes' : 'No' }}</td>
          <td class="py-2 pr-4">{{ f.submissionCount ?? 0 }}</td>
          <td class="py-2 text-right">
            <a :href="`/admin/forms/${f.handle}`" class="text-zinc-700 hover:underline">Edit</a>
            ·
            <a :href="`/admin/forms/${f.handle}/submissions`" class="text-zinc-700 hover:underline">Submissions</a>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!loading && forms.length === 0" class="mt-4 text-sm text-zinc-500">No forms yet.</p>
  </div>
</template>
