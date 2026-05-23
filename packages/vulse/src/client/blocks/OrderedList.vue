<script setup lang="ts">
import Node from '../Node.vue';
import type { BlockNode } from '../pm-types.js';

defineProps<{ node: BlockNode }>();
</script>

<template>
  <ol class="vulse-ordered-list">
    <Node v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
  </ol>
</template>
