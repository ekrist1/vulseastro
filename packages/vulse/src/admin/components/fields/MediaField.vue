<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { adminApi } from '../../client/api.js'
import MediaPicker from '../MediaPicker.vue'

const props = defineProps<{ modelValue: unknown; label?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

interface MediaItem {
  id: string
  alt: string | null
  deliveryUrl: string | null
  previewUrl: string
}

const showPicker = ref(false)
const preview = ref<MediaItem | null>(null)

const mediaId = () => (typeof props.modelValue === 'string' && props.modelValue ? props.modelValue : null)

function previewSrc(item: MediaItem): string {
  return item.deliveryUrl ?? item.previewUrl
}

async function loadPreview() {
  const id = mediaId()
  if (!id) {
    preview.value = null
    return
  }
  const list = await adminApi.get<MediaItem[]>('/api/vulse/media')
  preview.value = list.find((m) => m.id === id) ?? null
}

onMounted(loadPreview)
watch(() => props.modelValue, loadPreview)

function pick(id: string) {
  emit('update:modelValue', id)
  showPicker.value = false
  loadPreview()
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="label" class="vulse-label">{{ label }}</div>
    <div class="flex items-center gap-3">
      <img
        v-if="preview"
        :src="previewSrc(preview)"
        :alt="preview.alt ?? ''"
        class="h-20 w-20 rounded border object-cover"
      />
      <button type="button" class="rounded border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50" @click="showPicker = true">
        {{ mediaId() ? 'Change…' : 'Pick media…' }}
      </button>
      <button
        v-if="mediaId()"
        type="button"
        class="text-sm text-red-600 hover:underline"
        @click="emit('update:modelValue', null)"
      >
        Clear
      </button>
    </div>
    <MediaPicker v-if="showPicker" @pick="pick" @close="showPicker = false" />
  </div>
</template>
