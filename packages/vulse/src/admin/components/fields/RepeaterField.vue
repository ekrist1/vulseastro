<script setup lang="ts">
import type { FieldDescriptor } from '../../client/form-from-zod'
import FieldRenderer from './FieldRenderer.vue'
const props = defineProps<{ modelValue: Record<string, unknown>[]; label: string; itemFields: FieldDescriptor[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>[]): void }>()
function update(i: number, key: string, v: unknown) {
  const next = [...(props.modelValue ?? [])]
  next[i] = { ...next[i], [key]: v }
  emit('update:modelValue', next)
}
function add() { emit('update:modelValue', [...(props.modelValue ?? []), {}]) }
function remove(i: number) {
  const next = [...(props.modelValue ?? [])]; next.splice(i, 1); emit('update:modelValue', next)
}
</script>
<template>
  <div class="space-y-2">
    <div class="text-sm text-zinc-600">{{ label }}</div>
    <div v-for="(item, i) in modelValue ?? []" :key="i" class="border rounded p-3 space-y-2">
      <FieldRenderer v-for="f in itemFields" :key="f.path"
        :field="f" :model-value="item?.[f.path]"
        @update:modelValue="update(i, f.path, $event)" />
      <button type="button" @click="remove(i)" class="text-sm text-red-600">Remove</button>
    </div>
    <button type="button" @click="add" class="text-sm rounded border px-3 py-1">Add</button>
  </div>
</template>
