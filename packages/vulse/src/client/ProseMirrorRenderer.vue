<script setup lang="ts">
import { computed, provide } from 'vue';
import Node from './Node.vue';
import { defaultComponents } from './pm-defaults.js';
import { COMPONENTS_KEY } from './inject.js';
import type { BlockComponentMap, BlockNode } from './pm-types.js';

const props = defineProps<{
  doc: BlockNode | BlockNode[];
  components?: BlockComponentMap;
}>();

const merged = computed<BlockComponentMap>(() => ({
  ...defaultComponents,
  ...(props.components ?? {}),
}));

provide(COMPONENTS_KEY, merged.value);

const nodes = computed<BlockNode[]>(() => {
  if (Array.isArray(props.doc)) return props.doc;
  if (props.doc.type === 'doc' && props.doc.content) return props.doc.content;
  return [props.doc];
});
</script>

<template>
  <div class="vulse-doc">
    <Node v-for="(n, i) in nodes" :key="i" :node="n" />
  </div>
</template>
