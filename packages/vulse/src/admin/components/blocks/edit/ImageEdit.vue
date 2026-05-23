<script setup lang="ts">
import type { z } from 'astro/zod'
import { imageBlock } from '../../../../core/blocks/schema'
import MediaField from '../../fields/MediaField.vue'

type Block = z.infer<typeof imageBlock>

const props = defineProps<{ modelValue: Block }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block): void }>()

function update<K extends keyof Block>(k: K, v: Block[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}
</script>

<template>
  <div class="space-y-2">
    <MediaField
      :model-value="modelValue.mediaId || null"
      label="Image"
      @update:modelValue="update('mediaId', $event ?? '')"
    />
    <label class="block">
      <span class="vulse-label">Alt text</span>
      <input
        :value="modelValue.alt"
        class="vulse-input mt-1"
        @input="update('alt', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="block">
      <span class="vulse-label">Caption</span>
      <input
        :value="modelValue.caption ?? ''"
        class="vulse-input mt-1"
        @input="update('caption', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>
