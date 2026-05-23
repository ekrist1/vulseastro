<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'
import type { EntryNode } from '../../core/repos/entries.js'
import TreeRow from './TreeRow.vue'

const props = defineProps<{ handle: string }>()

const tree = ref<EntryNode[]>([])
const loading = ref(false)
const moving = ref(false)
const expanded = ref<Set<string>>(new Set())
const dragId = ref<string | null>(null)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    tree.value = await adminApi.get<EntryNode[]>(`/api/vulse/entries/${props.handle}/tree`)
    for (const root of tree.value) {
      expanded.value.add(root.id)
      for (const child of root.children) expanded.value.add(child.id)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load tree'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}

function descendantIds(node: EntryNode): Set<string> {
  const out = new Set<string>([node.id])
  function walk(n: EntryNode) {
    for (const c of n.children) {
      out.add(c.id)
      walk(c)
    }
  }
  walk(node)
  return out
}

function findNode(nodes: EntryNode[], id: string): EntryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

function siblingsOf(id: string): EntryNode[] {
  function walk(nodes: EntryNode[], parent: EntryNode[]): EntryNode[] | null {
    for (const n of nodes) {
      if (n.id === id) return parent
      const found = walk(n.children, n.children)
      if (found) return found
    }
    return null
  }
  return walk(tree.value, tree.value) ?? []
}

async function moveEntry(id: string, body: { parentId: string | null; sortOrder?: number }) {
  await adminApi.patch(`/api/vulse/entries/${props.handle}/${id}/move`, body)
}

async function moveUp(id: string) {
  const siblings = siblingsOf(id)
  const idx = siblings.findIndex((s) => s.id === id)
  if (idx <= 0) return
  moving.value = true
  try {
    const node = siblings[idx]!
    await moveEntry(id, { parentId: node.parentId, sortOrder: idx })
    await load()
  } finally {
    moving.value = false
  }
}

async function moveDown(id: string) {
  const siblings = siblingsOf(id)
  const idx = siblings.findIndex((s) => s.id === id)
  if (idx < 0 || idx >= siblings.length - 1) return
  moving.value = true
  try {
    const node = siblings[idx]!
    await moveEntry(id, { parentId: node.parentId, sortOrder: idx + 2 })
    await load()
  } finally {
    moving.value = false
  }
}

async function outdent(id: string) {
  const node = findNode(tree.value, id)
  if (!node || node.parentId === null) return
  const parent = findNode(tree.value, node.parentId)
  moving.value = true
  try {
    await moveEntry(id, { parentId: parent?.parentId ?? null })
    await load()
  } finally {
    moving.value = false
  }
}

async function indent(id: string) {
  const siblings = siblingsOf(id)
  const idx = siblings.findIndex((s) => s.id === id)
  if (idx <= 0) return
  const newParent = siblings[idx - 1]!
  moving.value = true
  try {
    await moveEntry(id, { parentId: newParent.id })
    expanded.value.add(newParent.id)
    expanded.value = new Set(expanded.value)
    await load()
  } finally {
    moving.value = false
  }
}

function onDragStart(event: DragEvent, id: string) {
  dragId.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent) {
  if (dragId.value) event.preventDefault()
}

async function onDropOnto(event: DragEvent, targetId: string | null) {
  event.preventDefault()
  const src = dragId.value
  dragId.value = null
  if (!src || src === targetId) return
  const srcNode = findNode(tree.value, src)
  if (srcNode && targetId !== null && descendantIds(srcNode).has(targetId)) {
    error.value = "Can't drop a page onto one of its descendants."
    return
  }
  moving.value = true
  try {
    await moveEntry(src, { parentId: targetId })
    if (targetId) {
      expanded.value.add(targetId)
      expanded.value = new Set(expanded.value)
    }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Move failed'
  } finally {
    moving.value = false
  }
}

async function destroy(id: string, label: string) {
  if (!confirm(`Delete "${label}" and any nested children? This cannot be undone.`)) return
  try {
    await adminApi.delete(`/api/vulse/entries/${props.handle}/${id}`)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not delete'
  }
}
</script>

<template>
  <div data-testid="collection-tree">
    <p v-if="error" class="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <div v-if="loading" class="text-sm text-zinc-500">Loading…</div>
    <div
      v-else-if="tree.length === 0"
      class="rounded border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500"
    >
      No pages yet. Use the “+ New” button to create your first entry.
    </div>
    <ul
      v-else
      class="divide-y divide-zinc-100 overflow-hidden rounded border border-zinc-200 bg-white"
      @dragover="onDragOver"
      @drop="(e) => onDropOnto(e, null)"
    >
      <TreeRow
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :handle="handle"
        :depth="0"
        :expanded-set="expanded"
        :dragging-id="dragId"
        :disabled="moving"
        @toggle="toggle"
        @move-up="moveUp"
        @move-down="moveDown"
        @outdent="outdent"
        @indent="indent"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drop-onto="onDropOnto"
        @destroy="destroy"
      />
    </ul>
  </div>
</template>
