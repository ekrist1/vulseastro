<script setup lang="ts">
import type { z } from 'zod'
import { embedBlock } from '../../../../core/blocks/schema'
type Block = z.infer<typeof embedBlock>
const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()
function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>
<template>
  <input :value="modelValue.url" @input="update('url', ($event.target as HTMLInputElement).value)"
    type="url" placeholder="https://…" class="w-full rounded border px-3 py-2" />
</template>
