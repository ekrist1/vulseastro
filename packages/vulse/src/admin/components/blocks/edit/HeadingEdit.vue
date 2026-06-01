<script setup lang="ts">
import type { z } from 'zod'
import { headingBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof headingBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>
<template>
  <div class="space-y-2">
    <select :value="modelValue.level" @change="update('level', Number(($event.target as HTMLSelectElement).value) as Block['level'])" class="rounded border px-2 py-1 text-sm">
      <option :value="1">H1</option><option :value="2">H2</option><option :value="3">H3</option><option :value="4">H4</option>
    </select>
    <input :value="modelValue.text" @input="update('text', ($event.target as HTMLInputElement).value)"
      placeholder="Heading…" class="w-full rounded border px-3 py-2" />
  </div>
</template>
