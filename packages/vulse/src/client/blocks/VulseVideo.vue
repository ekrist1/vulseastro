<script setup lang="ts">
import { computed } from 'vue';
import type { BlockNode } from '../pm-types.js';
import { sanitizeMediaSrc } from '../url.js';

const props = defineProps<{ node: BlockNode }>();
const src = computed(() => sanitizeMediaSrc(props.node.attrs?.src));
</script>

<template>
  <video
    v-if="src"
    data-vulse-embed="video"
    :src="src"
    controls
    preload="metadata"
  />
</template>
