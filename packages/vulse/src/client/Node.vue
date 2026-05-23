<script setup lang="ts">
import { type Component, computed, inject } from 'vue';
import { COMPONENTS_KEY } from './inject.js';
import type { BlockComponentMap, BlockNode } from './pm-types.js';

const props = defineProps<{
  node: BlockNode;
}>();

const components = inject<BlockComponentMap>(COMPONENTS_KEY, {});

const resolved = computed<Component | null>(() => components[props.node.type] ?? null);
</script>

<template>
  <component
    v-if="resolved"
    :is="resolved"
    :node="node"
  />
</template>
