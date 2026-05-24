<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { entryOptionLabel, useEntrySearch } from '../../composables/useEntrySearch.js'

const props = defineProps<{
  modelValue: string | null
  label: string
  collections: string[]
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

const selectedCollection = ref(props.collections[0] ?? '')
const selectedLabel = ref('')

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
  const col = selectedCollection.value || props.collections[0]
  return col ? [col] : props.collections
})

function selectOption(option: { id: string; collection: string; title?: string; email?: string }) {
  selectedCollection.value = option.collection
  emit('update:modelValue', option.id)
  selectedLabel.value = entryOptionLabel(option)
  query.value = ''
  closeDropdown()
}

function clearSelection() {
  emit('update:modelValue', null)
  selectedLabel.value = ''
  query.value = ''
}

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      selectedLabel.value = ''
      return
    }
    const col = selectedCollection.value || props.collections[0]
    if (!col) return
    void resolveLabel(value, col).then((label) => {
      selectedLabel.value = label
    })
  },
  { immediate: true },
)

watch(
  () => props.collections,
  (cols) => {
    if (cols.length === 1) selectedCollection.value = cols[0]!
  },
  { immediate: true },
)
</script>

<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <div class="mt-1 space-y-2">
      <select
        v-if="collections.length > 1"
        v-model="selectedCollection"
        class="vulse-input bg-white text-sm"
        @change="clearSelection()"
      >
        <option v-for="col in collections" :key="col" :value="col">{{ col }}</option>
      </select>

      <div class="relative" @blur="onBlur">
        <div class="flex gap-2">
          <button
            type="button"
            class="vulse-input flex flex-1 items-center justify-between bg-white text-left"
            :class="open && 'border-zinc-400'"
            @click="open ? closeDropdown() : openDropdown()"
          >
            <span :class="modelValue ? 'text-zinc-900' : 'text-zinc-400'">
              {{ modelValue ? selectedLabel || modelValue : 'Select entry…' }}
            </span>
            <span class="text-xs text-zinc-400">{{ open ? '▴' : '▾' }}</span>
          </button>
          <button
            v-if="modelValue"
            type="button"
            class="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            @click="clearSelection"
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
            <li v-for="option in options" v-else :key="`${option.collection}:${option.id}`">
              <button
                type="button"
                class="flex w-full items-center px-3 py-2 text-left hover:bg-zinc-100"
                :class="option.id === modelValue && 'bg-zinc-50 font-medium'"
                @click="selectOption(option)"
              >
                <span v-if="collections.length > 1" class="mr-2 text-xs text-zinc-400">{{ option.collection }}</span>
                {{ entryOptionLabel(option) }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </label>
</template>
