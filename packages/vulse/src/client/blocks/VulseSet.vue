<script setup lang="ts">
import { computed, inject } from 'vue';
import { COMPONENTS_KEY } from '../inject.js';
import type { BlockComponentMap, BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();

const components = inject<BlockComponentMap>(COMPONENTS_KEY, {});

const setName = computed<string | null>(() => {
  const s = (props.node.attrs as { set?: unknown } | undefined)?.set;
  return typeof s === 'string' ? s : null;
});

const data = computed<Record<string, unknown>>(() => {
  const d = (props.node.attrs as { data?: unknown } | undefined)?.data;
  return (d as Record<string, unknown> | undefined) ?? {};
});

const consumer = computed(() => (setName.value ? components[`set:${setName.value}`] : undefined));
</script>

<template>
  <component v-if="consumer" :is="consumer" :data="data" />
  <div v-else :data-vulse-missing-set="setName ?? ''" />
</template>
