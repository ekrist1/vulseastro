<script setup lang="ts">
import type { FieldDescriptor } from '../../client/form-from-zod'
import FieldRenderer from './FieldRenderer.vue'
defineProps<{ modelValue: Record<string, unknown>; label: string; fields: FieldDescriptor[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>): void }>()
function set(path: string, v: unknown, current: Record<string, unknown>) {
  emit('update:modelValue', { ...current, [path]: v })
}
</script>
<template>
  <fieldset class="border rounded p-4 space-y-3">
    <legend class="text-sm font-medium px-2">{{ label }}</legend>
    <FieldRenderer v-for="f in fields" :key="f.path"
      :field="f"
      :model-value="modelValue?.[f.path]"
      @update:modelValue="set(f.path, $event, modelValue ?? {})" />
  </fieldset>
</template>
