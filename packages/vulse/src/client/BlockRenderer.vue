<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from '../core/blocks/schema'
import type { BlockComponentMap } from './pm-types.js'
import ProseMirrorRenderer from './ProseMirrorRenderer.vue'

const props = defineProps<{
  blocks: Block[] | Record<string, unknown> | null | undefined
  mediaUrl?: (id: string, variant?: string) => string
  components?: BlockComponentMap
}>()

function isProseMirrorDoc(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && 'type' in v && (v as { type: string }).type === 'doc'
}

const doc = computed(() => (isProseMirrorDoc(props.blocks) ? props.blocks : null))
const legacyBlocks = computed(() => (Array.isArray(props.blocks) ? props.blocks : []))
</script>

<template>
  <ProseMirrorRenderer v-if="doc" :doc="doc" :components="components" />
  <div v-else class="vulse-blocks">
    <template v-for="(b, i) in legacyBlocks" :key="(b as Block).id ?? i">
      <h1 v-if="b.type === 'heading' && b.level === 1">{{ b.text }}</h1>
      <h2 v-else-if="b.type === 'heading' && b.level === 2">{{ b.text }}</h2>
      <h3 v-else-if="b.type === 'heading' && b.level === 3">{{ b.text }}</h3>
      <h4 v-else-if="b.type === 'heading' && b.level === 4">{{ b.text }}</h4>
      <p v-else-if="b.type === 'paragraph'">{{ b.text }}</p>
      <figure v-else-if="b.type === 'image'">
        <img v-if="mediaUrl" :src="mediaUrl(b.mediaId, 'hero')" :alt="b.alt" />
        <span v-else class="text-zinc-400">[image: {{ b.mediaId }}]</span>
        <figcaption v-if="b.caption">{{ b.caption }}</figcaption>
      </figure>
      <pre v-else-if="b.type === 'code'"><code :class="`language-${b.language}`">{{ b.code }}</code></pre>
      <iframe v-else-if="b.type === 'embed'" :src="b.url" class="w-full aspect-video" />
      <blockquote v-else-if="b.type === 'quote'">{{ b.text }}<cite v-if="b.cite">{{ b.cite }}</cite></blockquote>
      <ol v-else-if="b.type === 'list' && b.ordered"><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ol>
      <ul v-else-if="b.type === 'list' && !b.ordered"><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ul>
    </template>
  </div>
</template>
