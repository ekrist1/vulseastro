<script setup lang="ts">
import Node from '../Node.vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();
</script>

<template>
  <div data-vulse-accordion-group>
    <Node v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
  </div>
</template>
