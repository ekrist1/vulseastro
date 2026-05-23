<script setup lang="ts">
import type { Block } from '../../../core/blocks/schema'
import HeadingEdit from './edit/HeadingEdit.vue'
import ParagraphEdit from './edit/ParagraphEdit.vue'
import ImageEdit from './edit/ImageEdit.vue'
import CodeEdit from './edit/CodeEdit.vue'
import EmbedEdit from './edit/EmbedEdit.vue'
import QuoteEdit from './edit/QuoteEdit.vue'
import ListEdit from './edit/ListEdit.vue'

defineProps<{ block: Block; index: number; total: number }>()
defineEmits<{ (e: 'update', b: Block): void; (e: 'remove'): void; (e: 'move', dir: -1 | 1): void }>()
</script>

<template>
  <div class="p-4 flex gap-3 group">
    <div class="flex flex-col gap-1 text-zinc-400">
      <button type="button" @click="$emit('move', -1)" :disabled="index === 0" class="text-sm">↑</button>
      <button type="button" @click="$emit('move', 1)" :disabled="index === total - 1" class="text-sm">↓</button>
      <button type="button" @click="$emit('remove')" class="text-sm text-red-600 opacity-0 group-hover:opacity-100">×</button>
    </div>
    <div class="flex-1">
      <HeadingEdit v-if="block.type === 'heading'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <ParagraphEdit v-else-if="block.type === 'paragraph'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <ImageEdit v-else-if="block.type === 'image'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <CodeEdit v-else-if="block.type === 'code'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <EmbedEdit v-else-if="block.type === 'embed'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <QuoteEdit v-else-if="block.type === 'quote'" :model-value="block" @update:modelValue="$emit('update', $event)" />
      <ListEdit v-else-if="block.type === 'list'" :model-value="block" @update:modelValue="$emit('update', $event)" />
    </div>
  </div>
</template>
