<script setup lang="ts">
import { computed } from 'vue';
import type { BlockNode } from '../pm-types.js';
import { parseIframeCode } from '../embed.js';
import { sanitizeMediaSrc } from '../url.js';

const props = defineProps<{ node: BlockNode }>();
const parsed = computed(() => parseIframeCode(props.node.attrs?.code));
const src = computed(() => parsed.value?.src ?? sanitizeMediaSrc(props.node.attrs?.src));
const title = computed(
  () =>
    parsed.value?.title ??
    (typeof props.node.attrs?.title === 'string' ? props.node.attrs.title : 'Embedded content'),
);
const width = computed(() => parsed.value?.width);
const height = computed(() => parsed.value?.height);
const allow = computed(() => parsed.value?.allow);
const loading = computed<'lazy' | 'eager'>(() =>
  parsed.value?.loading === 'eager' ? 'eager' : 'lazy',
);
const referrerpolicy = computed<
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'
  | undefined
>(() => {
  const value = parsed.value?.referrerpolicy;
  if (
    value === 'no-referrer' ||
    value === 'no-referrer-when-downgrade' ||
    value === 'origin' ||
    value === 'origin-when-cross-origin' ||
    value === 'same-origin' ||
    value === 'strict-origin' ||
    value === 'strict-origin-when-cross-origin' ||
    value === 'unsafe-url'
  ) {
    return value;
  }
  return undefined;
});
const frameborder = computed(() => parsed.value?.frameborder ?? '0');
const allowfullscreen = computed(() => parsed.value?.allowfullscreen ?? true);
</script>

<template>
  <iframe
    v-if="src"
    data-vulse-embed="iframe"
    :src="src"
    :title="title"
    :width="width"
    :height="height"
    :allow="allow"
    :loading="loading"
    :referrerpolicy="referrerpolicy"
    :allowfullscreen="allowfullscreen"
    :frameborder="frameborder"
  />
</template>
