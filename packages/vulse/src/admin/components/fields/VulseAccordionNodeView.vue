<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { computed } from 'vue';
import {
  deleteCurrentNode,
  deleteCurrentNodeOrParentIfOnlyChild,
  insertContentAfter,
  insertParagraphAfter,
  parentNodeInfo,
} from './set-node-utils.js';

const props = defineProps<NodeViewProps>();

const summary = computed(() => String(props.node.attrs?.summary ?? 'Accordion'));
const open = computed(() => Boolean(props.node.attrs?.open));
const parent = computed(() => parentNodeInfo(props));
const isGrouped = computed(() => parent.value?.name === 'vulseAccordionGroup');
const itemNumber = computed(() => (isGrouped.value ? (parent.value?.index ?? 0) + 1 : null));

function onSummaryInput(event: Event) {
  props.updateAttributes({ summary: (event.target as HTMLInputElement).value || 'Accordion' });
}

function onOpenChange(event: Event) {
  props.updateAttributes({ open: (event.target as HTMLInputElement).checked });
}

function addAccordionBelow() {
  insertContentAfter(props, {
    type: 'vulseAccordion',
    attrs: { summary: 'Accordion', open: false },
    content: [{ type: 'paragraph' }],
  });
}

function addTextBelow() {
  insertParagraphAfter(props);
}

function removeSet() {
  if (isGrouped.value) {
    deleteCurrentNodeOrParentIfOnlyChild(props, 'vulseAccordionGroup');
    return;
  }

  deleteCurrentNode(props);
}
</script>

<template>
  <NodeViewWrapper
    class="overflow-hidden rounded-lg border border-zinc-200 bg-white"
    data-testid="accordion-node-view"
  >
    <div contenteditable="false" class="border-b border-zinc-200 px-3 py-2">
      <div class="mb-2 flex items-center justify-between gap-3">
        <div class="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {{ isGrouped ? `Item ${itemNumber}` : 'Accordion' }}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
            data-testid="accordion-add-item"
            @click="addAccordionBelow"
          >
            {{ isGrouped ? 'Add item below' : 'Add accordion below' }}
          </button>
          <button
            v-if="!isGrouped"
            type="button"
            class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
            data-testid="accordion-add-below"
            @click="addTextBelow"
          >
            Add text below
          </button>
          <button
            type="button"
            class="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            data-testid="accordion-delete"
            @click="removeSet"
          >
            {{ isGrouped ? 'Delete item' : 'Delete' }}
          </button>
        </div>
      </div>
      <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <label class="grid gap-1 text-xs text-zinc-500">
          <span>Title</span>
          <input
            class="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            :value="summary"
            data-testid="accordion-summary"
            @input="onSummaryInput"
          />
        </label>
        <label class="mt-1 flex items-center gap-2 text-xs text-zinc-500 md:mt-5">
          <input
            type="checkbox"
            class="rounded border-zinc-300"
            :checked="open"
            data-testid="accordion-open"
            @change="onOpenChange"
          />
          <span>Open by default</span>
        </label>
      </div>
    </div>
    <div class="px-3 py-3">
      <NodeViewContent class="min-h-10 rounded border border-zinc-200 bg-white px-3 py-2" />
    </div>
  </NodeViewWrapper>
</template>
