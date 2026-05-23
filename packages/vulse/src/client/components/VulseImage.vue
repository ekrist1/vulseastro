<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    asset: { id: string }
    alt?: string
    sizes?: string
    loading?: 'lazy' | 'eager'
  }>(),
  { alt: '', loading: 'lazy' },
)

const src = computed(() => `/api/vulse/media/${props.asset.id}/file`)
</script>

<template>
  <img
    :src="src"
    :sizes="sizes"
    :loading="loading"
    decoding="async"
    :alt="alt"
  />
</template>
