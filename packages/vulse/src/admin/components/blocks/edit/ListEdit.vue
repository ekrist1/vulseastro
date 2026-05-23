<script setup lang="ts">
import type { z } from 'astro/zod'
import { listBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof listBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function updateItems(items: string[]) {
  emit('update:modelValue', { ...props.modelValue, items })
}
function updateItem(i: number, v: string) {
  const next = [...props.modelValue.items]
  next[i] = v
  updateItems(next)
}
function addItem() { updateItems([...props.modelValue.items, '']) }
function removeItem(i: number) {
  const next = [...props.modelValue.items]
  next.splice(i, 1)
  updateItems(next.length ? next : [''])
}
</script>
<template>
  <div class="space-y-2">
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" :checked="modelValue.ordered"
        @change="emit('update:modelValue', { ...modelValue, ordered: ($event.target as HTMLInputElement).checked })" />
      Ordered list
    </label>
    <div v-for="(item, i) in modelValue.items" :key="i" class="flex gap-2">
      <input :value="item" @input="updateItem(i, ($event.target as HTMLInputElement).value)"
        class="flex-1 rounded border px-3 py-2" />
      <button type="button" @click="removeItem(i)" class="text-sm text-red-600">×</button>
    </div>
    <button type="button" @click="addItem" class="text-sm rounded border px-3 py-1">Add item</button>
  </div>
</template>
