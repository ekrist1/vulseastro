<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi, AdminApiError } from '../client/api'
import { useToast } from '../composables/toast'

interface TemplateSummary {
  key: string
  name: string
  description: string
  handles: string[]
}

interface ImportResult {
  created: string[]
  skipped: string[]
  failed: { handle: string; error: string }[]
}

const toast = useToast()

const tab = ref<'templates' | 'json'>('templates')
const templates = ref<TemplateSummary[]>([])
const loadingTemplates = ref(true)
const busy = ref<string | null>(null)
const jsonText = ref('')
const result = ref<ImportResult | null>(null)

onMounted(async () => {
  try {
    templates.value = await adminApi.get<TemplateSummary[]>('/api/vulse/blueprints/templates')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to load templates')
  } finally {
    loadingTemplates.value = false
  }
})

function summarize(r: ImportResult): string {
  const parts: string[] = []
  if (r.created.length) parts.push(`${r.created.length} created`)
  if (r.skipped.length) parts.push(`${r.skipped.length} skipped`)
  if (r.failed.length) parts.push(`${r.failed.length} failed`)
  return parts.join(', ') || 'Nothing to import'
}

function handleResult(r: ImportResult) {
  result.value = r
  if (r.failed.length) toast.error(`Import finished with errors: ${summarize(r)}`)
  else toast.success(`Import complete: ${summarize(r)}`)
}

async function importTemplate(key: string) {
  if (busy.value) return
  busy.value = key
  result.value = null
  try {
    handleResult(await adminApi.post<ImportResult>('/api/vulse/blueprints/templates/import', { key }))
  } catch (err) {
    toast.error(err instanceof AdminApiError ? err.message : 'Import failed')
  } finally {
    busy.value = null
  }
}

async function importJson() {
  if (busy.value) return
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText.value)
  } catch (err) {
    toast.error(`Invalid JSON: ${err instanceof Error ? err.message : err}`)
    return
  }
  busy.value = 'json'
  result.value = null
  try {
    handleResult(await adminApi.post<ImportResult>('/api/vulse/blueprints/import', parsed))
  } catch (err) {
    if (err instanceof AdminApiError) {
      toast.error(err.message)
    } else {
      toast.error('Import failed')
    }
  } finally {
    busy.value = null
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  jsonText.value = await file.text()
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <h1 class="text-xl font-semibold text-zinc-900">Import collections</h1>
    <p class="mt-1 text-sm text-zinc-500">
      Start from a predefined industry template or import your own JSON bundle. Existing
      collections (matching handles) are skipped, so importing is safe to re-run.
    </p>

    <div class="mt-5 flex gap-2 border-b border-zinc-200">
      <button
        type="button"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
        :class="tab === 'templates' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'"
        @click="tab = 'templates'"
      >
        Templates
      </button>
      <button
        type="button"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
        :class="tab === 'json' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'"
        @click="tab = 'json'"
      >
        Import JSON
      </button>
    </div>

    <!-- Templates -->
    <div v-if="tab === 'templates'" class="mt-4 space-y-3">
      <p v-if="loadingTemplates" class="text-sm text-zinc-500">Loading templates…</p>
      <div
        v-for="t in templates"
        :key="t.key"
        class="rounded-xl border border-zinc-200 bg-white p-4"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-sm font-semibold text-zinc-800">{{ t.name }}</h2>
            <p class="mt-1 text-xs text-zinc-500">{{ t.description }}</p>
            <p class="mt-2 text-xs text-zinc-400">
              Collections: <span class="font-mono">{{ t.handles.join(', ') }}</span>
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="!!busy"
            @click="importTemplate(t.key)"
          >
            {{ busy === t.key ? 'Importing…' : 'Import' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Import JSON -->
    <div v-else class="mt-4 space-y-3">
      <label class="block text-sm">
        <span class="font-medium text-zinc-700">Bundle JSON</span>
        <textarea
          v-model="jsonText"
          rows="14"
          spellcheck="false"
          class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-xs"
          placeholder='{ "version": 1, "blueprints": [ ... ] }'
        ></textarea>
      </label>
      <div class="flex items-center gap-3">
        <input type="file" accept="application/json,.json" class="text-xs text-zinc-600" @change="onFile" />
        <button
          type="button"
          class="ml-auto rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          :disabled="!!busy || !jsonText.trim()"
          @click="importJson"
        >
          {{ busy === 'json' ? 'Importing…' : 'Import bundle' }}
        </button>
      </div>
    </div>

    <!-- Result -->
    <div v-if="result" class="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
      <p class="font-medium text-zinc-800">{{ summarize(result) }}</p>
      <p v-if="result.created.length" class="mt-2 text-green-700">
        Created: <span class="font-mono">{{ result.created.join(', ') }}</span>
      </p>
      <p v-if="result.skipped.length" class="mt-1 text-zinc-500">
        Skipped: <span class="font-mono">{{ result.skipped.join(', ') }}</span>
      </p>
      <ul v-if="result.failed.length" class="mt-1 text-red-600">
        <li v-for="f in result.failed" :key="f.handle" class="font-mono text-xs">
          {{ f.handle }}: {{ f.error }}
        </li>
      </ul>
      <a
        v-if="result.created.length"
        :href="`/admin/schema/${result.created[0]}`"
        class="mt-3 inline-block text-xs font-medium text-zinc-700 underline"
      >
        View imported collections →
      </a>
    </div>
  </div>
</template>
