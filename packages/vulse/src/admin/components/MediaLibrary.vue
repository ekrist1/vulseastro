<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api.js'

interface MediaItem {
  id: string
  r2Key: string
  mime: string
  alt: string | null
  width: number | null
  height: number | null
  deliveryUrl: string | null
  previewUrl: string
}

const items = ref<MediaItem[]>([])
const uploading = ref(false)
const error = ref<string | null>(null)

function previewSrc(item: MediaItem): string {
  return item.deliveryUrl ?? item.previewUrl
}

async function load() {
  error.value = null
  try {
    items.value = await adminApi.get<MediaItem[]>('/api/vulse/media')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load media'
  }
}

async function onFiles(files: FileList | null) {
  if (!files?.length) return
  uploading.value = true
  error.value = null
  try {
    for (const f of Array.from(files)) {
      const form = new FormData()
      form.append('file', f)
      const res = await fetch('/api/vulse/media', { method: 'POST', body: form, credentials: 'same-origin' })
      const body = await res.json() as { ok: boolean; error?: { message: string } }
      if (!body.ok) throw new Error(body.error?.message ?? 'Upload failed')
    }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function softDelete(id: string) {
  if (!confirm('Delete this asset?')) return
  await adminApi.delete(`/api/vulse/media/${id}`)
  await load()
}

async function setAlt(id: string, alt: string) {
  await adminApi.patch(`/api/vulse/media/${id}`, { alt })
}

onMounted(load)
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <label class="vulse-button-primary cursor-pointer rounded px-4 py-2 text-sm font-medium">
        Upload
        <input
          type="file"
          multiple
          accept="image/*"
          class="hidden"
          @change="onFiles(($event.target as HTMLInputElement).files)"
        />
      </label>
      <span v-if="uploading" class="text-sm text-zinc-500">Uploading…</span>
    </div>

    <p v-if="error" class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>

    <div
      v-if="items.length === 0 && !uploading"
      class="rounded border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500"
    >
      No assets yet. Upload images to get started.
    </div>

    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="m in items" :key="m.id" class="space-y-2 rounded border border-zinc-200 bg-white p-2">
        <img :src="previewSrc(m)" :alt="m.alt ?? ''" class="aspect-square w-full rounded object-cover" />
        <input
          :value="m.alt ?? ''"
          placeholder="Alt text"
          class="vulse-input text-xs"
          @change="setAlt(m.id, ($event.target as HTMLInputElement).value)"
        />
        <button type="button" class="text-xs text-red-600 hover:underline" @click="softDelete(m.id)">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
