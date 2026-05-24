<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { entryOptionLabel, useEntrySearch } from '../../composables/useEntrySearch.js'

const props = defineProps<{
  modelValue: string[]
  label: string
  collections: string[]
  max?: number
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()

const selected = ref<Array<{ id: string; collection: string; label: string }>>([])

const {
  open,
  query,
  options,
  loading,
  resolveLabel,
  openDropdown,
  closeDropdown,
  onBlur,
} = useEntrySearch(() => props.collections)

const atMax = computed(() => props.max !== undefined && selected.value.length >= props.max)

const availableOptions = computed(() =>
  options.value.filter(
    (o) => !selected.value.some((s) => s.id === o.id && s.collection === o.collection),
  ),
)

async function syncSelected(ids: string[]) {
  if (ids.length === 0) {
    selected.value = []
    return
  }

  const next: Array<{ id: string; collection: string; label: string }> = []
  for (const id of ids) {
    let found = selected.value.find((s) => s.id === id)
    if (found) {
      next.push(found)
      continue
    }
    for (const collection of props.collections) {
      try {
        const label = await resolveLabel(id, collection)
        if (label && label !== id) {
          next.push({ id, collection, label })
          break
        }
      } catch {
        // try next collection
      }
    }
    if (!next.some((s) => s.id === id)) {
      next.push({ id, collection: props.collections[0] ?? '', label: id })
    }
  }
  selected.value = next
}

function addOption(option: { id: string; collection: string; title?: string; email?: string }) {
  if (atMax.value) return
  if (selected.value.some((s) => s.id === option.id)) return
  const next = [
    ...selected.value,
    { id: option.id, collection: option.collection, label: entryOptionLabel(option) },
  ]
  selected.value = next
  emit('update:modelValue', next.map((s) => s.id))
  query.value = ''
  if (props.max === 1) closeDropdown()
}

function removeAt(index: number) {
  const next = [...selected.value]
  next.splice(index, 1)
  selected.value = next
  emit('update:modelValue', next.map((s) => s.id))
}

watch(
  () => props.modelValue,
  (value) => {
    void syncSelected(value ?? [])
  },
  { immediate: true },
)
</script>

<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <div class="relative mt-1" @blur="onBlur">
      <div v-if="selected.length" class="mb-2 flex flex-wrap gap-2">
        <span
          v-for="(item, i) in selected"
          :key="item.id"
          class="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm"
        >
          {{ item.label }}
          <button type="button" class="text-zinc-400 hover:text-red-600" @click="removeAt(i)">×</button>
        </span>
      </div>

      <button
        v-if="!atMax"
        type="button"
        class="vulse-input flex w-full items-center justify-between bg-white text-left"
        :class="open && 'border-zinc-400'"
        @click="open ? closeDropdown() : openDropdown()"
      >
        <span class="text-zinc-400">{{ max === 1 ? 'Select entry…' : 'Add entry…' }}</span>
        <span class="text-xs text-zinc-400">{{ open ? '▴' : '▾' }}</span>
      </button>
      <p v-else-if="max" class="text-xs text-zinc-500">Maximum of {{ max }} selected.</p>

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
          <li v-else-if="availableOptions.length === 0" class="px-3 py-2 text-zinc-500">No matches</li>
          <li v-for="option in availableOptions" v-else :key="`${option.collection}:${option.id}`">
            <button
              type="button"
              class="flex w-full items-center px-3 py-2 text-left hover:bg-zinc-100"
              @click="addOption(option)"
            >
              <span v-if="collections.length > 1" class="mr-2 text-xs text-zinc-400">{{ option.collection }}</span>
              {{ entryOptionLabel(option) }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </label>
</template>
