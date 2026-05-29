<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { adminApi } from '../client/api.js'

const emit = defineEmits<{ (e: 'pick', id: string): void; (e: 'close'): void }>()

interface MediaItem {
  id: string
  alt: string | null
  deliveryUrl: string | null
  previewUrl: string
}

const items = ref<MediaItem[]>([])
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(m =>
    (m.alt ?? '').toLowerCase().includes(q)
  )
})

function previewSrc(item: MediaItem): string {
  return item.deliveryUrl ?? item.previewUrl
}

onMounted(async () => {
  items.value = await adminApi.get<MediaItem[]>('/api/vulse/media')
  await nextTick()
  searchInput.value?.focus()
})
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40" @click.self="$emit('close')">
    <div class="flex max-h-[85vh] w-[720px] flex-col rounded-xl bg-white p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">Pick a media item</h2>
        <button type="button" class="text-zinc-500 hover:text-zinc-800" @click="$emit('close')">×</button>
      </div>

      <input
        ref="searchInput"
        v-model="query"
        type="search"
        placeholder="Search assets…"
        class="vulse-input mb-3 text-sm"
      />

      <div class="min-h-0 flex-1 overflow-auto">
        <div v-if="items.length === 0" class="py-8 text-center text-sm text-zinc-500">
          No media yet. Upload assets from the Media page first.
        </div>
        <p v-else-if="filtered.length === 0" class="py-8 text-center text-sm text-zinc-500">
          No assets match "{{ query }}".
        </p>
        <div v-else class="grid grid-cols-4 gap-3">
          <button
            v-for="m in filtered"
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
  </div>
</template>
