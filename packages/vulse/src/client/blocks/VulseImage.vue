<script setup lang="ts">
import { computed } from 'vue';
import VulseImage from '../components/VulseImage.vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();

const asset = computed(() => {
  const a = props.node.attrs?.asset;
  if (a && typeof a === 'object' && 'id' in a) return a as { id: string };
  const id = props.node.attrs?.assetId;
  return typeof id === 'string' ? { id } : null;
});

const alt = computed(() => (typeof props.node.attrs?.alt === 'string' ? props.node.attrs.alt : ''));
const caption = computed(() =>
  typeof props.node.attrs?.caption === 'string' ? props.node.attrs.caption : '',
);
const sizes = computed(() =>
  typeof props.node.attrs?.sizes === 'string' ? props.node.attrs.sizes : undefined,
);
</script>

<template>
  <figure v-if="asset" data-vulse-block="image">
    <VulseImage v-if="sizes" :asset="asset" :alt="alt" :sizes="sizes" />
    <VulseImage v-else :asset="asset" :alt="alt" />
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>
