<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ modelValue: string | Date | null | undefined; label: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()
const local = computed({
  get() {
    if (!props.modelValue) return ''
    const d = props.modelValue instanceof Date ? props.modelValue : new Date(props.modelValue)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 16)
  },
  set(v: string) {
    emit('update:modelValue', v ? new Date(v).toISOString() : null)
  },
})
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <input v-model="local" type="datetime-local" class="mt-1 w-full rounded border px-3 py-2" />
  </label>
</template>
