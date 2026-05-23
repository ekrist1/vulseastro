<script setup lang="ts">
import Node from '../Node.vue';
import type { BlockNode } from '../pm-types.js';

defineProps<{ node: BlockNode }>();
</script>

<template>
  <p class="vulse-paragraph">
    <Node v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
  </p>
</template>
