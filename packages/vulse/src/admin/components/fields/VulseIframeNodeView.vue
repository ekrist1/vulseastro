<script setup lang="ts">
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { ref, watch } from 'vue';
import { deleteCurrentNode, insertParagraphAfter } from './set-node-utils.js';
import { parseIframeCode } from './url-utils.js';

const props = defineProps<NodeViewProps>();

const codeDraft = ref(
  String(
    props.node.attrs?.code ??
      (props.node.attrs?.src
        ? `<iframe src="${String(props.node.attrs.src)}" title="${String(props.node.attrs?.title ?? 'Embedded content')}"></iframe>`
        : ''),
  ),
);
const invalidCode = ref(false);

watch(
  () => props.node.attrs?.code,
  (value) => {
    codeDraft.value = String(value ?? '');
    invalidCode.value = false;
  },
);

function commitCode() {
  if (!codeDraft.value.trim()) {
    props.updateAttributes({ code: null, src: null, title: 'Embedded content' });
    invalidCode.value = false;
    return;
  }

  const parsed = parseIframeCode(codeDraft.value);
  if (!parsed) {
    invalidCode.value = true;
    return;
  }
  invalidCode.value = false;
  codeDraft.value = parsed.code;
  props.updateAttributes(parsed);
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
    data-testid="iframe-node-view"
    contenteditable="false"
  >
    <div class="border-b border-zinc-200 px-3 py-2">
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs font-medium uppercase tracking-wide text-zinc-500">Iframe</div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
            data-testid="iframe-add-below"
            @click="addBelow"
          >
            Add text below
          </button>
          <button
            type="button"
            class="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            data-testid="iframe-delete"
            @click="removeSet"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
    <div class="grid gap-3 px-3 py-3">
      <label class="grid gap-1 text-xs text-zinc-500">
        <span>Iframe code</span>
        <textarea
          v-model="codeDraft"
          class="min-h-32 rounded border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900"
          placeholder="<iframe src=&quot;https://example.com/embed&quot; title=&quot;Embedded content&quot;></iframe>"
          data-testid="iframe-code"
          @blur="commitCode"
        />
      </label>
      <div v-if="invalidCode" class="text-xs text-red-600">
        Enter a valid iframe snippet with an `http` or `https` `src`.
      </div>
      <div class="text-xs text-zinc-500">
        Paste the full iframe snippet. Vulse stores the code and renders a sanitized iframe on the frontend.
      </div>
    </div>
  </NodeViewWrapper>
</template>
