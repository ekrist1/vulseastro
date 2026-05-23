<script setup lang="ts">
import type { BlockType } from '../../../core/blocks/schema'
import { BUILT_IN_BLOCK_TYPES } from '../../../core/blocks/schema'
defineEmits<{ (e: 'add', t: BlockType): void }>()
</script>
<template>
  <div class="p-2 flex flex-wrap gap-1 border-t bg-zinc-50">
    <button v-for="t in BUILT_IN_BLOCK_TYPES" :key="t" type="button"
      @click="$emit('add', t)"
      class="px-3 py-1 rounded border bg-white text-sm hover:bg-zinc-100">+ {{ t }}</button>
  </div>
</template>
