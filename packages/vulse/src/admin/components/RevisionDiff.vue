<script setup lang="ts">
import { computed } from 'vue'
import { diffJson } from 'diff'

const props = defineProps<{ from: unknown; to: unknown }>()
const parts = computed(() => diffJson(props.from as object, props.to as object))
</script>
<template>
  <pre class="bg-zinc-50 border rounded p-3 text-xs overflow-auto whitespace-pre-wrap"><span v-for="(p, i) in parts" :key="i"
    :class="p.added ? 'bg-green-100 text-green-900' : p.removed ? 'bg-red-100 text-red-900' : ''">{{ p.value }}</span></pre>
</template>
