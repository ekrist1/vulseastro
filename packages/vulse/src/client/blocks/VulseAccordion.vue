<script setup lang="ts">
import { computed } from 'vue';
import Node from '../Node.vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();
const summary = computed(() => String(props.node.attrs?.summary ?? 'Accordion'));
const open = computed(() => Boolean(props.node.attrs?.open));
</script>

<template>
  <details data-vulse-accordion :open="open || undefined">
    <summary>{{ summary }}</summary>
    <Node v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
  </details>
</template>
