<script setup lang="ts">
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { ref, watch } from 'vue';
import { deleteCurrentNode, insertParagraphAfter } from './set-node-utils.js';
import { sanitizeMediaSrc } from './url-utils.js';

const props = defineProps<NodeViewProps>();

const srcDraft = ref(String(props.node.attrs?.src ?? ''));
const invalidSrc = ref(false);

watch(
  () => props.node.attrs?.src,
  (value) => {
    srcDraft.value = String(value ?? '');
    invalidSrc.value = false;
  },
);

function commitSrc() {
  const sanitized = sanitizeMediaSrc(srcDraft.value);
  if (!srcDraft.value.trim()) {
    props.updateAttributes({ src: null });
    invalidSrc.value = false;
    return;
  }
  if (!sanitized) {
    invalidSrc.value = true;
    return;
  }
  invalidSrc.value = false;
  srcDraft.value = sanitized;
  props.updateAttributes({ src: sanitized });
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
    data-testid="video-node-view"
    contenteditable="false"
  >
    <div class="border-b border-zinc-200 px-3 py-2">
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs font-medium uppercase tracking-wide text-zinc-500">Video</div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
            data-testid="video-add-below"
            @click="addBelow"
          >
            Add text below
          </button>
          <button
            type="button"
            class="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            data-testid="video-delete"
            @click="removeSet"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
    <div class="grid gap-3 px-3 py-3">
      <label class="grid gap-1 text-xs text-zinc-500">
        <span>Video URL</span>
        <input
          v-model="srcDraft"
          class="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          placeholder="https://example.com/video.mp4"
          data-testid="video-src"
          @blur="commitSrc"
        />
      </label>
      <div v-if="invalidSrc" class="text-xs text-red-600">
        Enter a valid `http` or `https` URL.
      </div>
      <div class="text-xs text-zinc-500">
        The video renders on the frontend using the saved source URL.
      </div>
    </div>
  </NodeViewWrapper>
</template>
