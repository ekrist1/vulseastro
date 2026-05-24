<script setup lang="ts">
import type { FieldDescriptor } from '../../client/form-from-zod'
import FieldRenderer from './FieldRenderer.vue'

const props = defineProps<{
  modelValue: Record<string, unknown>[]
  label: string
  itemFields: FieldDescriptor[]
  mode?: 'table' | 'stacked'
  minRows?: number
  maxRows?: number
  addLabel?: string
  tree?: boolean
  linkCollections?: string[]
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>[]): void }>()

function rows(): Record<string, unknown>[] {
  return props.modelValue ?? []
}

function canAdd(): boolean {
  if (props.maxRows === undefined) return true
  return rows().length < props.maxRows
}

function canRemove(): boolean {
  if (props.minRows === undefined) return true
  return rows().length > props.minRows
}

function updateCell(rowIndex: number, key: string, value: unknown) {
  const next = [...rows()]
  next[rowIndex] = { ...next[rowIndex], [key]: value }
  emit('update:modelValue', next)
}

function addRow() {
  if (!canAdd()) return
  emit('update:modelValue', [...rows(), {}])
}

function removeRow(index: number) {
  if (!canRemove()) return
  const next = [...rows()]
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function moveRow(index: number, direction: -1 | 1) {
  const next = [...rows()]
  const target = index + direction
  if (target < 0 || target >= next.length) return
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="space-y-2">
    <div class="text-sm text-zinc-600">{{ label }}</div>

    <div v-if="mode === 'table' && itemFields.length" class="overflow-x-auto rounded border">
      <table class="min-w-full text-sm">
        <thead class="bg-zinc-50 text-left text-xs text-zinc-600">
          <tr>
            <th class="w-16 px-2 py-2"></th>
            <th v-for="f in itemFields" :key="f.path" class="px-3 py-2 font-medium">{{ f.label ?? f.path }}</th>
            <th class="w-16 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in rows()" :key="i" class="border-t border-zinc-200 align-top">
            <td class="px-2 py-2">
              <div class="flex flex-col gap-1">
                <button
                  type="button"
                  class="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                  :disabled="i === 0"
                  @click="moveRow(i, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                  :disabled="i === rows().length - 1"
                  @click="moveRow(i, 1)"
                >
                  ↓
                </button>
              </div>
            </td>
            <td v-for="f in itemFields" :key="f.path" class="px-3 py-2">
              <FieldRenderer
                :field="f"
                :model-value="item?.[f.path]"
                :tree="tree"
                :link-collections="linkCollections"
                @update:modelValue="updateCell(i, f.path, $event)"
              />
            </td>
            <td class="px-2 py-2">
              <button
                type="button"
                class="text-xs text-red-600 disabled:opacity-30"
                :disabled="!canRemove()"
                @click="removeRow(i)"
              >
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="space-y-3">
      <div v-for="(item, i) in rows()" :key="i" class="space-y-2 rounded border p-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-500">Row {{ i + 1 }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
              :disabled="i === 0"
              @click="moveRow(i, -1)"
            >
              Move up
            </button>
            <button
              type="button"
              class="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
              :disabled="i === rows().length - 1"
              @click="moveRow(i, 1)"
            >
              Move down
            </button>
            <button
              type="button"
              class="text-xs text-red-600 disabled:opacity-30"
              :disabled="!canRemove()"
              @click="removeRow(i)"
            >
              Remove
            </button>
          </div>
        </div>
        <FieldRenderer
          v-for="f in itemFields"
          :key="f.path"
          :field="f"
          :model-value="item?.[f.path]"
          :tree="tree"
          :link-collections="linkCollections"
          @update:modelValue="updateCell(i, f.path, $event)"
        />
      </div>
    </div>

    <button
      v-if="canAdd()"
      type="button"
      class="text-sm rounded border px-3 py-1"
      @click="addRow"
    >
      {{ addLabel || 'Add row' }}
    </button>
    <p v-else-if="maxRows" class="text-xs text-zinc-500">Maximum of {{ maxRows }} rows reached.</p>
  </div>
</template>
