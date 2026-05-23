<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { appendContentInside, deleteCurrentNode, insertParagraphAfter } from './set-node-utils.js';

const props = defineProps<NodeViewProps>();

function addItem() {
  appendContentInside(props, {
    type: 'vulseAccordion',
    attrs: { summary: 'Accordion', open: false },
    content: [{ type: 'paragraph' }],
  });
}

function addTextBelow() {
  insertParagraphAfter(props);
}

function removeGroup() {
  deleteCurrentNode(props);
}
</script>

<template>
  <NodeViewWrapper
    class="my-4 overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50"
    data-testid="accordion-group-node-view"
  >
    <div
      contenteditable="false"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3"
    >
      <div>
        <div class="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Accordion group
        </div>
        <div class="text-xs text-zinc-500">Items inside this block render together.</div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
          data-testid="accordion-group-add-item"
          @click="addItem"
        >
          Add item
        </button>
        <button
          type="button"
          class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
          data-testid="accordion-group-add-below"
          @click="addTextBelow"
        >
          Add text below
        </button>
        <button
          type="button"
          class="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          data-testid="accordion-group-delete"
          @click="removeGroup"
        >
          Delete group
        </button>
      </div>
    </div>
    <div class="space-y-3 px-3 py-3">
      <NodeViewContent class="space-y-3" />
    </div>
  </NodeViewWrapper>
</template>
