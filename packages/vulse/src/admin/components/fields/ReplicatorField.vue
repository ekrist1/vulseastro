<script setup lang="ts">
import { computed } from 'vue'
import type { ReplicatorSetDefinition } from '../../../core/blueprints/definition.js'
import { nestedFieldToDescriptor } from '../../../core/blueprints/code-to-definition.js'
import FieldRenderer from './FieldRenderer.vue'

interface ReplicatorItem {
  set: string
  content: Record<string, unknown>
}

const props = defineProps<{
  label: string
  modelValue: unknown
  replicatorSets?: ReplicatorSetDefinition[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ReplicatorItem[]): void }>()

const items = computed<ReplicatorItem[]>(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as ReplicatorItem[]) : [],
)
const setMap = computed(() => new Map((props.replicatorSets ?? []).map((set) => [set.name, set])))

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function labelForSet(set: ReplicatorSetDefinition): string {
  return set.label?.trim() || humanize(set.name)
}

function defaultForField(field: ReplicatorSetDefinition['fields'][number]): unknown {
  if (field.default !== undefined) return field.default
  switch (field.ui.kind) {
    case 'boolean': return false
    case 'blocks': return { type: 'doc', content: [{ type: 'paragraph' }] }
    case 'date': return new Date().toISOString().slice(0, 16)
    default: return ''
  }
}

function emitItems(next: ReplicatorItem[]) {
  emit('update:modelValue', next)
}

function addSet(set: ReplicatorSetDefinition) {
  const content: Record<string, unknown> = {}
  for (const field of set.fields) content[field.name] = defaultForField(field)
  emitItems([...items.value, { set: set.name, content }])
}

function removeItem(index: number) {
  emitItems(items.value.filter((_, current) => current !== index))
}

function moveItem(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= items.value.length) return
  const next = [...items.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  emitItems(next)
}

function updateField(index: number, fieldName: string, value: unknown) {
  const next = [...items.value]
  const current = next[index]
  if (!current) return
  next[index] = { ...current, content: { ...current.content, [fieldName]: value } }
  emitItems(next)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <span class="block text-sm font-medium text-zinc-700">{{ label }}</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="set in replicatorSets ?? []"
          :key="set.name"
          type="button"
          class="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          @click="addSet(set)"
        >
          + {{ labelForSet(set) }}
        </button>
      </div>
    </div>

    <div v-if="items.length === 0" class="rounded border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
      No sets added yet.
    </div>

    <div v-for="(item, index) in items" :key="`${item.set}-${index}`" class="rounded-xl border border-zinc-200 bg-white">
      <div class="flex items-center gap-2 border-b border-zinc-200 px-3 py-2">
        <button type="button" class="px-2 text-zinc-400 hover:text-zinc-700" @click="moveItem(index, -1)">↑</button>
        <button type="button" class="px-2 text-zinc-400 hover:text-zinc-700" @click="moveItem(index, 1)">↓</button>
        <div class="flex-1">
          <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {{ setMap.get(item.set) ? labelForSet(setMap.get(item.set)!) : item.set }}
          </span>
        </div>
        <button type="button" class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" @click="removeItem(index)">Remove</button>
      </div>
      <div v-if="setMap.get(item.set)" class="space-y-4 p-3">
        <FieldRenderer
          v-for="field in setMap.get(item.set)!.fields.map(nestedFieldToDescriptor)"
          :key="`${item.set}-${field.path}`"
          :field="field"
          :model-value="item.content?.[field.path]"
          @update:modelValue="(v: unknown) => updateField(index, field.path, v)"
        />
      </div>
      <div v-else class="p-3 text-sm text-amber-700">
        This set no longer exists in the schema.
      </div>
    </div>
  </div>
</template>
