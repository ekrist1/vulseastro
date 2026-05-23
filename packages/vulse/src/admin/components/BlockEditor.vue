<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Block } from '../../core/blocks/schema'
import BlockToolbar from './blocks/BlockToolbar.vue'
import BlockItem from './blocks/BlockItem.vue'
import { nanoid } from 'nanoid'

const props = defineProps<{ modelValue: Block[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Block[]): void }>()
const blocks = ref<Block[]>(props.modelValue ?? [])
watch(() => props.modelValue, (v) => { blocks.value = v ?? [] })
watch(blocks, (v) => emit('update:modelValue', v), { deep: true })

function add(type: Block['type']) {
  const id = nanoid(8)
  const empty: Block =
    type === 'heading' ? { type, level: 2, text: '', id } :
    type === 'paragraph' ? { type, text: '', id } :
    type === 'image' ? { type, mediaId: '', alt: '', id } :
    type === 'code' ? { type, language: 'ts', code: '', id } :
    type === 'embed' ? { type, url: 'https://', id } :
    type === 'quote' ? { type, text: '', id } :
    { type: 'list', ordered: false, items: [''], id }
  blocks.value = [...blocks.value, empty]
}

function update(i: number, b: Block) {
  blocks.value = blocks.value.map((x, j) => (j === i ? b : x))
}

function remove(i: number) {
  blocks.value = blocks.value.filter((_, j) => j !== i)
}

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= blocks.value.length) return
  const next = [...blocks.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  blocks.value = next
}
</script>

<template>
  <div class="border rounded bg-white">
    <div class="divide-y">
      <BlockItem v-for="(b, i) in blocks" :key="b.id ?? i"
        :block="b" :index="i" :total="blocks.length"
        @update="update(i, $event)" @remove="remove(i)" @move="move(i, $event)" />
    </div>
    <BlockToolbar @add="add" />
  </div>
</template>
