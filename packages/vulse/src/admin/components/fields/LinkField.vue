<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LinkValue } from '../../../core/blueprints/definition.js'
import { entryOptionLabel, useEntrySearch } from '../../composables/useEntrySearch.js'

const props = defineProps<{
  modelValue: LinkValue | null | undefined
  label: string
  collections?: string[]
  tree?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: LinkValue | null): void }>()

type LinkMode = LinkValue['type']

const mode = ref<LinkMode>('url')
const url = ref('')
const entryCollection = ref(props.collections?.[0] ?? '')
const entryLabel = ref('')

const entryCollections = computed(() => props.collections ?? [])

const {
  open,
  query,
  options,
  loading,
  resolveLabel,
  openDropdown,
  closeDropdown,
  onBlur,
} = useEntrySearch(() => {
  const col = entryCollection.value || entryCollections.value[0]
  return col ? [col] : []
})

function emitValue(value: LinkValue | null) {
  emit('update:modelValue', value)
}

function onModeChange(next: LinkMode) {
  mode.value = next
  if (next === 'url') {
    emitValue(url.value.trim() ? { type: 'url', url: url.value.trim() } : null)
    return
  }
  if (next === 'first-child') {
    emitValue({ type: 'first-child' })
    return
  }
  emitValue(null)
}

function onUrlInput() {
  const trimmed = url.value.trim()
  emitValue(trimmed ? { type: 'url', url: trimmed } : null)
}

function selectEntry(option: { id: string; collection: string; title?: string; email?: string }) {
  entryCollection.value = option.collection
  entryLabel.value = entryOptionLabel(option)
  emitValue({ type: 'entry', entryId: option.id, collection: option.collection })
  query.value = ''
  closeDropdown()
}

function clearEntry() {
  entryLabel.value = ''
  emitValue(null)
}

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      mode.value = 'url'
      url.value = ''
      entryLabel.value = ''
      return
    }
    mode.value = value.type
    if (value.type === 'url') {
      url.value = value.url
      return
    }
    if (value.type === 'entry') {
      entryCollection.value = value.collection
      void resolveLabel(value.entryId, value.collection).then((label) => {
        entryLabel.value = label
      })
    }
  },
  { immediate: true },
)

watch(
  entryCollections,
  (cols) => {
    if (cols.length === 1) entryCollection.value = cols[0]!
  },
  { immediate: true },
)
</script>

<template>
  <div class="block space-y-2">
    <span class="text-sm text-zinc-600">{{ label }}</span>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded border px-3 py-1 text-sm"
        :class="mode === 'url' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700'"
        @click="onModeChange('url')"
      >
        URL
      </button>
      <button
        type="button"
        class="rounded border px-3 py-1 text-sm"
        :class="mode === 'entry' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700'"
        @click="onModeChange('entry')"
      >
        Entry
      </button>
      <button
        v-if="tree"
        type="button"
        class="rounded border px-3 py-1 text-sm"
        :class="mode === 'first-child' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700'"
        @click="onModeChange('first-child')"
      >
        First child
      </button>
    </div>

    <input
      v-if="mode === 'url'"
      v-model="url"
      type="url"
      class="vulse-input mt-1 bg-white"
      placeholder="https://example.com or /about"
      @input="onUrlInput"
    />

    <div v-else-if="mode === 'entry'" class="space-y-2">
      <select
        v-if="entryCollections.length > 1"
        v-model="entryCollection"
        class="vulse-input bg-white text-sm"
        @change="clearEntry()"
      >
        <option v-for="col in entryCollections" :key="col" :value="col">{{ col }}</option>
      </select>

      <div class="relative" @blur="onBlur">
        <div class="flex gap-2">
          <button
            type="button"
            class="vulse-input flex flex-1 items-center justify-between bg-white text-left"
            :class="open && 'border-zinc-400'"
            @click="open ? closeDropdown() : openDropdown()"
          >
            <span :class="modelValue?.type === 'entry' ? 'text-zinc-900' : 'text-zinc-400'">
              {{
                modelValue?.type === 'entry'
                  ? entryLabel || modelValue.entryId
                  : 'Select entry…'
              }}
            </span>
            <span class="text-xs text-zinc-400">{{ open ? '▴' : '▾' }}</span>
          </button>
          <button
            v-if="modelValue?.type === 'entry'"
            type="button"
            class="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            @click="clearEntry"
          >
            Clear
          </button>
        </div>

        <div
          v-if="open"
          class="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          <div class="border-b border-zinc-200 p-2">
            <input
              v-model="query"
              type="search"
              class="vulse-input bg-white"
              placeholder="Search entries…"
              autofocus
              @keydown.esc.prevent="closeDropdown()"
            />
          </div>
          <ul class="max-h-48 overflow-auto py-1 text-sm">
            <li v-if="loading" class="px-3 py-2 text-zinc-500">Loading…</li>
            <li v-else-if="options.length === 0" class="px-3 py-2 text-zinc-500">No matches</li>
            <li v-for="option in options" v-else :key="option.id">
              <button
                type="button"
                class="flex w-full items-center px-3 py-2 text-left hover:bg-zinc-100"
                @click="selectEntry(option)"
              >
                {{ entryOptionLabel(option) }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <p v-else-if="mode === 'first-child'" class="text-sm text-zinc-500">
      Links to the first child entry in this collection tree.
    </p>
  </div>
</template>
