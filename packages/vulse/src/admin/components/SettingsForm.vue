<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi, AdminApiError } from '../client/api'

const values = ref<Record<string, string>>({ siteName: '', deployHookUrl: '' })
const initial = ref<Record<string, string>>({ siteName: '', deployHookUrl: '' })
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const all = await adminApi.get<Record<string, unknown>>('/api/vulse/settings')
    const next = {
      siteName: String(all.siteName ?? ''),
      deployHookUrl: String(all.deployHookUrl ?? ''),
    }
    values.value = { ...next }
    initial.value = { ...next }
  } finally {
    loading.value = false
  }
}

function isDirty(key: keyof typeof values.value): boolean {
  return values.value[key] !== initial.value[key]
}

function anyDirty(): boolean {
  return (Object.keys(values.value) as Array<keyof typeof values.value>).some(isDirty)
}

async function save() {
  if (!anyDirty()) return
  saving.value = true
  saved.value = false
  error.value = null
  try {
    for (const key of Object.keys(values.value) as Array<keyof typeof values.value>) {
      if (isDirty(key)) {
        await adminApi.put(`/api/vulse/settings/${key}`, { value: values.value[key] })
      }
    }
    initial.value = { ...values.value }
    saved.value = true
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

function onInput() {
  saved.value = false
  error.value = null
}

onMounted(load)
</script>

<template>
  <form class="vulse-panel max-w-md space-y-4" @submit.prevent="save">
    <p v-if="loading" class="text-sm text-zinc-500">Loading…</p>
    <template v-else>
      <label class="block">
        <span class="text-sm font-medium text-zinc-700">Site name</span>
        <input
          v-model="values.siteName"
          class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          @input="onInput"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium text-zinc-700">Deploy hook URL</span>
        <input
          v-model="values.deployHookUrl"
          class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          placeholder="https://api.cloudflare.com/client/v4/pages/…/deploy_hooks/…"
          @input="onInput"
        />
        <span class="mt-1 block text-xs text-zinc-500">
          Called after publishing entries to trigger a rebuild (e.g. a Cloudflare Pages deploy hook).
        </span>
      </label>
      <p v-if="error" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
      <div class="flex items-center gap-3 pt-2">
        <button
          type="submit"
          class="vulse-button-primary rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          :disabled="saving || !anyDirty()"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="text-sm text-zinc-500">Saved.</span>
        <span v-else-if="anyDirty()" class="text-sm text-amber-600">Unsaved changes</span>
      </div>
    </template>
  </form>
</template>
