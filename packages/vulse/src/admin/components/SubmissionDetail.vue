<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'

const props = defineProps<{ formHandle: string; submissionId: string }>()

interface SubmissionRow {
  id: string
  payload: Record<string, unknown>
  fileRefs: { field: string; mediaId: string }[]
  status: string
  error: string | null
  createdAt: string
}

const row = ref<SubmissionRow | null>(null)

onMounted(async () => {
  row.value = await adminApi.get<SubmissionRow>(`/api/vulse/forms/${props.formHandle}/submissions/${props.submissionId}`)
})

async function destroy() {
  if (!confirm('Delete this submission?')) return
  await adminApi.delete(`/api/vulse/forms/${props.formHandle}/submissions/${props.submissionId}`)
  window.location.href = `/admin/forms/${props.formHandle}/submissions`
}
</script>

<template>
  <div v-if="row">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Submission</h1>
      <button type="button" class="rounded border border-red-200 px-3 py-1 text-sm text-red-700" @click="destroy">Delete</button>
    </div>
    <p class="mb-2 text-sm text-zinc-500">Status: <span class="rounded bg-zinc-100 px-2 py-0.5">{{ row.status }}</span></p>
    <p v-if="row.error" class="mb-4 text-sm text-red-600">{{ row.error }}</p>
    <pre class="rounded-xl border border-zinc-200 bg-white p-4 text-xs">{{ JSON.stringify(row.payload, null, 2) }}</pre>
    <div v-if="row.fileRefs.length" class="mt-4">
      <h2 class="text-sm font-semibold">Files</h2>
      <ul class="mt-2 text-sm">
        <li v-for="f in row.fileRefs" :key="f.mediaId">{{ f.field }}: {{ f.mediaId }}</li>
      </ul>
    </div>
  </div>
</template>
