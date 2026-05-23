<script setup lang="ts">
import { computed } from 'vue';
import Node from '../Node.vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();
const tag = computed(() => {
  const level = (props.node.attrs?.level as number | undefined) ?? 1;
  return `h${Math.min(Math.max(level, 1), 6)}`;
});
</script>

<template>
  <component :is="tag" class="vulse-heading">
    <Node v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
  </component>
</template>
