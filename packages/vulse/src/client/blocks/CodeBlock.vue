<script setup lang="ts">
import { computed } from 'vue';
import type { BlockNode } from '../pm-types.js';

const props = defineProps<{ node: BlockNode }>();
const text = computed(() => (props.node.content ?? []).map((c) => c.text ?? '').join(''));
const language = computed(() => (props.node.attrs?.language as string | undefined) ?? null);
</script>

<template>
  <pre class="vulse-code-block"><code :data-language="language">{{ text }}</code></pre>
</template>
