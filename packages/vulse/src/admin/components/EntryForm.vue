<script setup lang="ts">
import { ref } from 'vue'
import { adminApi, AdminApiError } from '../client/api'
import type { FieldDescriptor } from '../client/form-from-zod'
import FieldRenderer from './fields/FieldRenderer.vue'

const props = defineProps<{ collection: string; entryId?: string; fields: FieldDescriptor[]; initial: Record<string, unknown> }>()
const content = ref<Record<string, unknown>>({ ...props.initial })
delete content.value.slug
delete content.value.status
const slug = ref<string>(String(props.initial?.slug ?? ''))
const status = ref<'draft' | 'published'>((props.initial?.status as 'draft' | 'published') ?? 'draft')
const error = ref<string | null>(null)
const saving = ref(false)

async function save() {
  saving.value = true; error.value = null
  try {
    if (props.entryId) {
      await adminApi.put(`/api/vulse/entries/${props.collection}/${props.entryId}`, { content: content.value, slug: slug.value, status: status.value })
    } else {
      const created = await adminApi.post<{ id: string }>(`/api/vulse/entries/${props.collection}`, { content: content.value, slug: slug.value, status: status.value })
      window.location.href = `/admin/collections/${props.collection}/${created.id}`
      return
    }
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : 'Save failed'
  } finally { saving.value = false }
}
</script>

<template>
  <form @submit.prevent="save" class="space-y-4 max-w-3xl">
    <label class="block">
      <span class="text-sm text-zinc-600">slug</span>
      <input v-model="slug" required class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <FieldRenderer v-for="f in fields" :key="f.path"
      :field="f" :model-value="content[f.path]"
      @update:modelValue="content = { ...content, [f.path]: $event }" />
    <label class="block">
      <span class="text-sm text-zinc-600">Status</span>
      <select v-model="status" class="mt-1 rounded border px-3 py-2">
        <option value="draft">Draft</option><option value="published">Published</option>
      </select>
    </label>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <button :disabled="saving" class="rounded bg-brand text-white px-4 py-2">
      {{ saving ? 'Saving…' : 'Save' }}
    </button>
  </form>
</template>
