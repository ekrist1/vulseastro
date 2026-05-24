<script setup lang="ts">
import { ref, watch } from 'vue'
import { adminApi } from '../../client/api.js'

const props = defineProps<{ modelValue: string | null; label: string; refTarget: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

interface RefOption {
  id: string
  title?: string
  email?: string
}

const open = ref(false)
const query = ref('')
const options = ref<RefOption[]>([])
const loading = ref(false)
const selectedLabel = ref('')

function optionLabel(option: RefOption): string {
  return option.title ?? option.email ?? option.id
}

async function loadOptions(search = '') {
  loading.value = true
  try {
    if (props.refTarget === 'user') {
      options.value = await adminApi.get<RefOption[]>(
        `/api/vulse/users?q=${encodeURIComponent(search)}`,
      )
      return
    }

    const rows = await adminApi.get<{ id: string; content?: { title?: string }; slug?: string }[]>(
      `/api/vulse/entries/${props.refTarget}`,
    )
    const needle = search.trim().toLowerCase()
    options.value = rows
      .map((row) => ({
        id: row.id,
        title: row.content?.title ?? row.slug ?? row.id,
      }))
      .filter((row) => {
        if (!needle) return true
        return optionLabel(row).toLowerCase().includes(needle)
      })
  } finally {
    loading.value = false
  }
}

async function resolveSelectedLabel(id: string | null) {
  if (!id) {
    selectedLabel.value = ''
    return
  }

  if (props.refTarget === 'user') {
    const users = await adminApi.get<RefOption[]>(`/api/vulse/users?q=${encodeURIComponent(id)}`)
    const match = users.find((user) => user.id === id)
    selectedLabel.value = match ? optionLabel(match) : id
    return
  }

  const row = await adminApi.get<{ id: string; content?: { title?: string }; slug?: string }>(
    `/api/vulse/entries/${props.refTarget}/${id}`,
  )
  selectedLabel.value = row.content?.title ?? row.slug ?? row.id
}

function openDropdown() {
  open.value = true
  void loadOptions(query.value)
}

function closeDropdown() {
  open.value = false
}

function onBlur(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  closeDropdown()
}

function selectOption(option: RefOption) {
  emit('update:modelValue', option.id)
  selectedLabel.value = optionLabel(option)
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
    void resolveSelectedLabel(value)
  },
  { immediate: true },
)

watch(query, (value) => {
  if (!open.value) return
  void loadOptions(value)
})
</script>

<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <div class="relative mt-1" @blur="onBlur">
      <div class="flex gap-2">
        <button
          type="button"
          class="vulse-input flex flex-1 items-center justify-between bg-white text-left"
          :class="open && 'border-zinc-400'"
          @click="open ? closeDropdown() : openDropdown()"
        >
          <span :class="modelValue ? 'text-zinc-900' : 'text-zinc-400'">
            {{ modelValue ? selectedLabel || modelValue : `Select ${refTarget}…` }}
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
            :placeholder="`Search ${refTarget}…`"
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
              :class="option.id === modelValue && 'bg-zinc-50 font-medium'"
              @click="selectOption(option)"
            >
              {{ optionLabel(option) }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </label>
</template>
