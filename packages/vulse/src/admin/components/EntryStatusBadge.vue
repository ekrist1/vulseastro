<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'draft' | 'published'
  hasUnpublishedChanges?: boolean
}>()

const label = computed(() => {
  if (props.status === 'draft') return 'Draft'
  if (props.hasUnpublishedChanges) return 'Published · unpublished changes'
  return 'Published'
})

const tone = computed(() => {
  if (props.status === 'draft') return 'bg-zinc-100 text-zinc-700'
  if (props.hasUnpublishedChanges) return 'bg-amber-50 text-amber-800'
  return 'bg-emerald-50 text-emerald-800'
})
</script>

<template>
  <span class="rounded px-2 py-0.5 text-xs font-medium" :class="tone">{{ label }}</span>
</template>
