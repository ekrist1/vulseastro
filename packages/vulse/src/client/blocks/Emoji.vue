<script setup lang="ts">
import { computed } from 'vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();
const value = computed(() => String(props.node.attrs?.value ?? '🙂'));
const label = computed(() =>
  typeof props.node.attrs?.label === 'string' ? props.node.attrs.label : null,
);
</script>

<template>
  <span data-vulse-emoji :aria-label="label ?? undefined">{{ value }}</span>
</template>
