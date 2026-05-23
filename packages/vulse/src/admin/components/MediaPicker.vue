<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api.js'

const emit = defineEmits<{ (e: 'pick', id: string): void; (e: 'close'): void }>()

interface MediaItem {
  id: string
  alt: string | null
  deliveryUrl: string | null
  previewUrl: string
}

const items = ref<MediaItem[]>([])

function previewSrc(item: MediaItem): string {
  return item.deliveryUrl ?? item.previewUrl
}

onMounted(async () => {
  items.value = await adminApi.get<MediaItem[]>('/api/vulse/media')
})
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40" @click.self="$emit('close')">
    <div class="max-h-[80vh] w-[720px] overflow-auto rounded-xl bg-white p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">Pick a media item</h2>
        <button type="button" class="text-zinc-500 hover:text-zinc-800" @click="$emit('close')">×</button>
      </div>
      <div v-if="items.length === 0" class="py-8 text-center text-sm text-zinc-500">
        No media yet. Upload assets from the Media page first.
      </div>
      <div v-else class="grid grid-cols-4 gap-3">
        <button
          v-for="m in items"
          :key="m.id"
          type="button"
          class="rounded border p-2 hover:ring-2 hover:ring-[var(--vulse-color-accent)]"
          @click="$emit('pick', m.id)"
        >
          <img :src="previewSrc(m)" :alt="m.alt ?? ''" class="aspect-square w-full rounded object-cover" />
          <div v-if="m.alt" class="mt-1 truncate text-xs">{{ m.alt }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
