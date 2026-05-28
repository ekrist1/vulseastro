<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { adminApi, AdminApiError } from '../client/api'

interface Redirect {
  id: string
  fromPath: string
  toUrl: string
  status: 301 | 302 | 307 | 308
  enabled: boolean
  hits: number
  lastHitAt: string | null
  createdAt: string
  updatedAt: string
}

const items = ref<Redirect[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const draft = reactive({
  fromPath: '',
  toUrl: '',
  status: 301 as 301 | 302 | 307 | 308,
  enabled: true,
})
const submitting = ref(false)
const editingId = ref<string | null>(null)
const editDraft = reactive({
  fromPath: '',
  toUrl: '',
  status: 301 as 301 | 302 | 307 | 308,
  enabled: true,
})

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await adminApi.get<Redirect[]>('/api/vulse/redirects')
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function create() {
  if (!draft.fromPath || !draft.toUrl) return
  submitting.value = true
  error.value = null
  try {
    await adminApi.post('/api/vulse/redirects', { ...draft })
    draft.fromPath = ''
    draft.toUrl = ''
    draft.status = 301
    draft.enabled = true
    await load()
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}

function startEdit(r: Redirect) {
  editingId.value = r.id
  editDraft.fromPath = r.fromPath
  editDraft.toUrl = r.toUrl
  editDraft.status = r.status
  editDraft.enabled = r.enabled
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(id: string) {
  error.value = null
  try {
    await adminApi.patch(`/api/vulse/redirects/${id}`, { ...editDraft })
    editingId.value = null
    await load()
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : String(e)
  }
}

async function toggleEnabled(r: Redirect) {
  try {
    await adminApi.patch(`/api/vulse/redirects/${r.id}`, { enabled: !r.enabled })
    await load()
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : String(e)
  }
}

async function remove(r: Redirect) {
  if (!confirm(`Delete redirect ${r.fromPath} → ${r.toUrl}?`)) return
  try {
    await adminApi.delete(`/api/vulse/redirects/${r.id}`)
    await load()
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : String(e)
  }
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleString() } catch { return s }
}
</script>

<template>
  <div class="space-y-6">
    <form
      class="rounded border bg-white p-4 space-y-3"
      @submit.prevent="create"
    >
      <h2 class="text-base font-semibold">Add redirect</h2>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-[2fr_2fr_auto_auto_auto]">
        <label class="block">
          <span class="block text-xs text-zinc-600">From path</span>
          <input
            v-model="draft.fromPath"
            type="text"
            required
            placeholder="/old-page"
            class="mt-1 w-full rounded border px-2 py-1 text-sm"
          >
        </label>
        <label class="block">
          <span class="block text-xs text-zinc-600">To URL</span>
          <input
            v-model="draft.toUrl"
            type="text"
            required
            placeholder="/new-page or https://example.com/page"
            class="mt-1 w-full rounded border px-2 py-1 text-sm"
          >
        </label>
        <label class="block">
          <span class="block text-xs text-zinc-600">Status</span>
          <select v-model.number="draft.status" class="mt-1 rounded border px-2 py-1 text-sm">
            <option :value="301">301</option>
            <option :value="302">302</option>
            <option :value="307">307</option>
            <option :value="308">308</option>
          </select>
        </label>
        <label class="flex items-end gap-1 pb-1 text-sm">
          <input v-model="draft.enabled" type="checkbox">
          <span>Enabled</span>
        </label>
        <div class="flex items-end">
          <button
            type="submit"
            :disabled="submitting"
            class="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </form>

    <div v-if="error" class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {{ error }}
    </div>

    <div v-if="loading" class="text-sm text-zinc-500">Loading…</div>

    <table v-else class="w-full bg-white border rounded text-sm">
      <thead>
        <tr class="border-b text-left">
          <th class="p-3">From</th>
          <th class="p-3">To</th>
          <th class="p-3 w-20">Status</th>
          <th class="p-3 w-24">Enabled</th>
          <th class="p-3 w-20">Hits</th>
          <th class="p-3 w-40">Last hit</th>
          <th class="p-3 w-40 text-right" />
        </tr>
      </thead>
      <tbody>
        <tr v-if="!items.length">
          <td colspan="7" class="p-6 text-center text-zinc-500">No redirects yet.</td>
        </tr>
        <template v-for="r in items" :key="r.id">
          <tr v-if="editingId !== r.id" class="border-b">
            <td class="p-3 font-mono text-xs">{{ r.fromPath }}</td>
            <td class="p-3 font-mono text-xs break-all">{{ r.toUrl }}</td>
            <td class="p-3">{{ r.status }}</td>
            <td class="p-3">
              <button
                type="button"
                class="rounded px-2 py-0.5 text-xs"
                :class="r.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'"
                @click="toggleEnabled(r)"
              >
                {{ r.enabled ? 'on' : 'off' }}
              </button>
            </td>
            <td class="p-3">{{ r.hits }}</td>
            <td class="p-3 text-xs text-zinc-600">{{ formatDate(r.lastHitAt) }}</td>
            <td class="p-3 text-right space-x-2">
              <button type="button" class="text-brand hover:underline" @click="startEdit(r)">Edit</button>
              <button type="button" class="text-red-700 hover:underline" @click="remove(r)">Delete</button>
            </td>
          </tr>
          <tr v-else class="border-b bg-amber-50">
            <td class="p-3"><input v-model="editDraft.fromPath" class="w-full rounded border px-2 py-1 text-xs"></td>
            <td class="p-3"><input v-model="editDraft.toUrl" class="w-full rounded border px-2 py-1 text-xs"></td>
            <td class="p-3">
              <select v-model.number="editDraft.status" class="rounded border px-1 py-1 text-xs">
                <option :value="301">301</option>
                <option :value="302">302</option>
                <option :value="307">307</option>
                <option :value="308">308</option>
              </select>
            </td>
            <td class="p-3"><input v-model="editDraft.enabled" type="checkbox"></td>
            <td class="p-3 text-zinc-400">—</td>
            <td class="p-3 text-zinc-400">—</td>
            <td class="p-3 text-right space-x-2">
              <button type="button" class="rounded bg-zinc-900 px-2 py-1 text-xs text-white" @click="saveEdit(r.id)">Save</button>
              <button type="button" class="text-zinc-600 hover:underline" @click="cancelEdit">Cancel</button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
