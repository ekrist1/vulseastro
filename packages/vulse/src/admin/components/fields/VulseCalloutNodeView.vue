<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { computed } from 'vue';
import { deleteCurrentNode, insertParagraphAfter } from './set-node-utils.js';

const props = defineProps<NodeViewProps>();

const tone = computed(() => String(props.node.attrs?.tone === 'warn' ? 'warn' : 'info'));

function onToneChange(event: Event) {
  const next = (event.target as HTMLSelectElement).value === 'warn' ? 'warn' : 'info';
  props.updateAttributes({ tone: next });
}

function addBelow() {
  insertParagraphAfter(props);
}

function removeSet() {
  deleteCurrentNode(props);
}
</script>

<template>
  <NodeViewWrapper
    class="my-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
    data-testid="callout-node-view"
  >
    <div
      contenteditable="false"
      class="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2"
    >
      <div class="text-xs font-medium uppercase tracking-wide text-zinc-500">Callout</div>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-xs text-zinc-500">
          <span>Tone</span>
          <select
            class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
            :value="tone"
            data-testid="callout-tone"
            @change="onToneChange"
          >
            <option value="info">Info</option>
            <option value="warn">Warn</option>
          </select>
        </label>
        <button
          type="button"
          class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
          data-testid="callout-add-below"
          @click="addBelow"
        >
          Add text below
        </button>
        <button
          type="button"
          class="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          data-testid="callout-delete"
          @click="removeSet"
        >
          Delete
        </button>
      </div>
    </div>
    <div class="px-3 py-3">
      <NodeViewContent class="min-h-10 rounded border border-zinc-200 bg-white px-3 py-2" />
    </div>
  </NodeViewWrapper>
</template>
