<script setup lang="ts">
import type { z } from 'zod'
import { paragraphBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof paragraphBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>
<template>
  <textarea :value="modelValue.text" @input="update('text', ($event.target as HTMLTextAreaElement).value)"
    rows="4" placeholder="Paragraph…" class="w-full rounded border px-3 py-2"></textarea>
</template>
