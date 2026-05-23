<script setup lang="ts">
import { ref, watch } from 'vue'
import { adminApi } from '../../client/api'
const props = defineProps<{ modelValue: string | null; label: string; refTarget: string }>()
defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()
const query = ref('')
const results = ref<{ id: string; title?: string; email?: string }[]>([])
async function search() {
  if (props.refTarget === 'user') {
    results.value = await adminApi.get(`/api/vulse/users?q=${encodeURIComponent(query.value)}`)
  } else {
    const rows = await adminApi.get<{ id: string; content?: { title?: string }; slug?: string }[]>(`/api/vulse/entries/${props.refTarget}`)
    results.value = rows.map((r) => ({ id: r.id, title: r.content?.title ?? r.slug }))
  }
}
watch(query, () => { if (query.value.length >= 1) search() })
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <input v-model="query" :placeholder="`Search ${refTarget}…`" class="mt-1 w-full rounded border px-3 py-2" />
    <ul v-if="results.length" class="mt-1 border rounded bg-white max-h-48 overflow-auto">
      <li v-for="r in results" :key="r.id"
        @click="$emit('update:modelValue', r.id); query = r.title ?? r.email ?? r.id; results = []"
        class="px-3 py-2 hover:bg-zinc-100 cursor-pointer">{{ r.title ?? r.email ?? r.id }}</li>
    </ul>
  </label>
</template>
