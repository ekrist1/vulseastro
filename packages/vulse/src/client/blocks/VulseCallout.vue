<script setup lang="ts">
import { computed } from 'vue';
import Node from '../Node.vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();
const tone = computed(() => (props.node.attrs?.tone as string | undefined) ?? 'info');
</script>

<template>
  <aside data-vulse-callout :data-tone="tone">
    <Node v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
  </aside>
</template>
