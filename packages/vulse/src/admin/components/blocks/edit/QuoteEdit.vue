<script setup lang="ts">
import type { z } from 'zod'
import { quoteBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof quoteBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>
<template>
  <div class="space-y-2">
    <textarea :value="modelValue.text" @input="update('text', ($event.target as HTMLTextAreaElement).value)"
      rows="3" placeholder="Quote…" class="w-full rounded border px-3 py-2"></textarea>
    <input :value="modelValue.cite ?? ''" @input="update('cite', ($event.target as HTMLInputElement).value)"
      placeholder="Citation" class="w-full rounded border px-3 py-2 text-sm" />
  </div>
</template>
