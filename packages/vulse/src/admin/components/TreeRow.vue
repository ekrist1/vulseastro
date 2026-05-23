<script setup lang="ts">
import { computed } from 'vue'
import type { EntryNode } from '../../core/repos/entries.js'

const props = defineProps<{
  node: EntryNode
  handle: string
  depth: number
  expandedSet: Set<string>
  draggingId: string | null
  disabled: boolean
}>()

const emit = defineEmits<{
  toggle: [id: string]
  'move-up': [id: string]
  'move-down': [id: string]
  outdent: [id: string]
  indent: [id: string]
  'drag-start': [event: DragEvent, id: string]
  'drag-over': [event: DragEvent]
  'drop-onto': [event: DragEvent, id: string | null]
  destroy: [id: string, label: string]
}>()

const hasChildren = computed(() => props.node.children.length > 0)
const isOpen = computed(() => props.expandedSet.has(props.node.id))
const isDragging = computed(() => props.draggingId === props.node.id)

function label(): string {
  const c = props.node.content as Record<string, unknown>
  return (
    (c.title as string | undefined) ??
    (c.name as string | undefined) ??
    (c.label as string | undefined) ??
    props.node.slug ??
    props.node.id
  )
}
</script>

<template>
  <li
    :data-testid="`tree-row-${node.id}`"
    :draggable="!disabled"
    :class="['flex flex-col', isDragging ? 'opacity-50' : '']"
    @dragstart="emit('drag-start', $event, node.id)"
  >
    <div
      class="flex items-center gap-1 px-2 py-1.5 hover:bg-zinc-50"
      :style="{ paddingLeft: `${depth * 1.25 + 0.5}rem` }"
      @dragover="emit('drag-over', $event)"
      @drop="emit('drop-onto', $event, node.id)"
    >
      <button
        v-if="hasChildren"
        type="button"
        class="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200"
        :aria-expanded="isOpen"
        :data-testid="`tree-toggle-${node.id}`"
        @click="emit('toggle', node.id)"
      >
        {{ isOpen ? '▾' : '▸' }}
      </button>
      <span v-else class="inline-block h-5 w-5"></span>
      <a
        :href="`/admin/collections/${handle}/${node.id}`"
        class="flex-1 truncate text-sm text-zinc-800 hover:underline"
        :data-testid="`tree-link-${node.id}`"
      >
        {{ label() }}
      </a>
      <span
        v-if="node.hasUnpublishedChanges"
        class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800"
      >
        draft
      </span>
      <span class="hidden text-[10px] text-zinc-400 sm:inline">#{{ node.sortOrder }}</span>
      <div class="flex shrink-0 items-center gap-0.5 text-zinc-400">
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-40"
          :disabled="disabled"
          title="Move up"
          :data-testid="`tree-up-${node.id}`"
          @click="emit('move-up', node.id)"
        >
          ↑
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-40"
          :disabled="disabled"
          title="Move down"
          :data-testid="`tree-down-${node.id}`"
          @click="emit('move-down', node.id)"
        >
          ↓
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-40"
          :disabled="disabled || node.parentId === null"
          title="Outdent"
          :data-testid="`tree-outdent-${node.id}`"
          @click="emit('outdent', node.id)"
        >
          ⇤
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-40"
          :disabled="disabled"
          title="Indent"
          :data-testid="`tree-indent-${node.id}`"
          @click="emit('indent', node.id)"
        >
          ⇥
        </button>
        <a
          :href="`/admin/collections/${handle}/new?parent_id=${node.id}`"
          class="rounded px-1.5 py-0.5 text-xs hover:bg-zinc-200 hover:text-zinc-700"
          title="Add child"
          :data-testid="`tree-add-child-${node.id}`"
        >
          +
        </a>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
          :disabled="disabled"
          title="Delete"
          :data-testid="`tree-delete-${node.id}`"
          @click="emit('destroy', node.id, label())"
        >
          ×
        </button>
      </div>
    </div>
    <ul v-if="hasChildren && isOpen" class="border-t border-zinc-100">
      <TreeRow
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :handle="handle"
        :depth="depth + 1"
        :expanded-set="expandedSet"
        :dragging-id="draggingId"
        :disabled="disabled"
        @toggle="(id) => emit('toggle', id)"
        @move-up="(id) => emit('move-up', id)"
        @move-down="(id) => emit('move-down', id)"
        @outdent="(id) => emit('outdent', id)"
        @indent="(id) => emit('indent', id)"
        @drag-start="(e, id) => emit('drag-start', e, id)"
        @drag-over="(e) => emit('drag-over', e)"
        @drop-onto="(e, id) => emit('drop-onto', e, id)"
        @destroy="(id, lbl) => emit('destroy', id, lbl)"
      />
    </ul>
  </li>
</template>
