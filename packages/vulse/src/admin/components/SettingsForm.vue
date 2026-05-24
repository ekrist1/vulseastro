<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { adminApi, AdminApiError } from '../client/api'

interface Values {
  siteName: string
  deployHookUrl: string
  defaultLocale: string
  locales: string[]
}

const values = ref<Values>({ siteName: '', deployHookUrl: '', defaultLocale: 'default', locales: ['default'] })
const initial = ref<Values>({ siteName: '', deployHookUrl: '', defaultLocale: 'default', locales: ['default'] })
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)
const localesText = ref('default')

const LOCALE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$|^default$/

const localesValid = computed(() => {
  const codes = parseLocales(localesText.value)
  if (codes.length === 0) return 'Add at least one locale.'
  for (const c of codes) {
    if (!LOCALE_RE.test(c)) return `Invalid locale code: ${c}`
  }
  if (!codes.includes(values.value.defaultLocale)) return `Default locale "${values.value.defaultLocale}" must appear in the supported list.`
  return null
})

function parseLocales(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

const supportedLocales = computed(() => parseLocales(localesText.value))

watch(localesText, () => {
  const codes = supportedLocales.value
  if (codes.length > 0 && !codes.includes(values.value.defaultLocale)) {
    values.value.defaultLocale = codes[0]
  }
})

async function load() {
  loading.value = true
  try {
    const all = await adminApi.get<Record<string, unknown>>('/api/vulse/settings')
    const locales = Array.isArray(all.locales) && all.locales.length
      ? (all.locales as string[])
      : ['default']
    const defaultLocale = typeof all.defaultLocale === 'string' ? all.defaultLocale : 'default'
    const next: Values = {
      siteName: String(all.siteName ?? ''),
      deployHookUrl: String(all.deployHookUrl ?? ''),
      defaultLocale,
      locales,
    }
    values.value = { ...next }
    initial.value = { ...next, locales: [...next.locales] }
    localesText.value = locales.join(', ')
  } finally {
    loading.value = false
  }
}

function dirty(key: keyof Values): boolean {
  if (key === 'locales') {
    const a = parseLocales(localesText.value)
    const b = initial.value.locales
    return a.length !== b.length || a.some((v, i) => v !== b[i])
  }
  return values.value[key] !== initial.value[key]
}

function anyDirty(): boolean {
  return dirty('siteName') || dirty('deployHookUrl') || dirty('defaultLocale') || dirty('locales')
}

async function save() {
  if (!anyDirty()) return
  if (localesValid.value) {
    error.value = localesValid.value
    return
  }
  saving.value = true
  saved.value = false
  error.value = null
  try {
    values.value.locales = parseLocales(localesText.value)
    if (dirty('siteName')) await adminApi.put('/api/vulse/settings/siteName', { value: values.value.siteName })
    if (dirty('deployHookUrl')) await adminApi.put('/api/vulse/settings/deployHookUrl', { value: values.value.deployHookUrl })
    if (dirty('defaultLocale')) await adminApi.put('/api/vulse/settings/defaultLocale', { value: values.value.defaultLocale })
    if (dirty('locales')) await adminApi.put('/api/vulse/settings/locales', { value: values.value.locales })
    initial.value = { ...values.value, locales: [...values.value.locales] }
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

      <fieldset class="space-y-3 rounded border border-zinc-200 bg-white p-4">
        <legend class="text-sm font-semibold text-zinc-700">Locales</legend>
        <p class="text-xs text-zinc-500">
          Each entry can be authored once per supported locale. The default locale is used when callers don't pass one.
        </p>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Supported locales</span>
          <input
            v-model="localesText"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            placeholder="default, en, nb-NO"
            @input="onInput"
          />
          <span class="mt-1 block text-xs text-zinc-500">
            Comma-separated BCP-47 codes (e.g. <code>en</code>, <code>nb-NO</code>). The literal <code>default</code> is allowed for sites that don't ship multilingual content.
          </span>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Default locale</span>
          <select
            v-if="supportedLocales.length"
            v-model="values.defaultLocale"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            @change="onInput"
          >
            <option v-for="code in supportedLocales" :key="code" :value="code">{{ code }}</option>
          </select>
          <input
            v-else
            v-model="values.defaultLocale"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            disabled
            placeholder="Add supported locales first"
          />
        </label>
        <p v-if="localesValid" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ localesValid }}</p>
      </fieldset>

      <p v-if="error" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
      <div class="flex items-center gap-3 pt-2">
        <button
          type="submit"
          class="vulse-button-primary rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          :disabled="saving || !anyDirty() || !!localesValid"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="text-sm text-zinc-500">Saved.</span>
        <span v-else-if="anyDirty()" class="text-sm text-amber-600">Unsaved changes</span>
      </div>
    </template>
  </form>
</template>
