<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    asset: { id: string }
    alt?: string
    sizes?: string
    loading?: 'lazy' | 'eager'
    /** Intrinsic dimensions — set to reserve layout space and avoid CLS. */
    width?: number
    height?: number
    /** Pre-built srcset (e.g. from `sdk.media.srcset(id, widths)`) for responsive delivery. */
    srcset?: string
  }>(),
  { alt: '', loading: 'lazy' },
)

const src = computed(() => `/api/vulse/public/media/${props.asset.id}/file`)
</script>

<template>
  <img
    :src="src"
    :srcset="srcset"
    :sizes="sizes"
    :width="width"
    :height="height"
    :loading="loading"
    decoding="async"
    :alt="alt"
  />
</template>
