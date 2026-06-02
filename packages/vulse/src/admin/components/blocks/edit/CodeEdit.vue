<script setup lang="ts">
import type { z } from 'zod'
import { codeBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof codeBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>
<template>
  <div class="space-y-2">
    <input :value="modelValue.language" @input="update('language', ($event.target as HTMLInputElement).value)"
      placeholder="Language" class="w-full rounded border px-3 py-2 text-sm" />
    <textarea :value="modelValue.code" @input="update('code', ($event.target as HTMLTextAreaElement).value)"
      rows="6" placeholder="Code…" class="w-full rounded border px-3 py-2 font-mono text-sm"></textarea>
  </div>
</template>
