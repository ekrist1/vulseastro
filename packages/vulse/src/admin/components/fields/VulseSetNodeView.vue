<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, onMounted, ref } from 'vue'
import { nestedFieldToDescriptor } from '../../../core/blueprints/code-to-definition.js'
import { useSets } from '../../composables/useSets.js'
import FieldRenderer from './FieldRenderer.vue'

const props = defineProps(nodeViewProps)
const { get, hydrate } = useSets()
onMounted(() => { void hydrate() })

const expanded = ref(false)

const setHandle = computed<string | null>(() => {
  const s = (props.node.attrs as { set?: unknown }).set
  return typeof s === 'string' ? s : null
})

const setDef = computed(() => (setHandle.value ? get(setHandle.value) : undefined))

const data = computed<Record<string, unknown>>(() => {
  return ((props.node.attrs as { data?: unknown }).data as Record<string, unknown> | undefined) ?? {}
})

const fieldDescriptors = computed(() => (setDef.value?.fields ?? []).map(nestedFieldToDescriptor))

function updateField(name: string, value: unknown) {
  props.updateAttributes({ data: { ...data.value, [name]: value } })
}

const summary = computed(() => {
  const def = setDef.value
  if (!def) return ''
  const firstText = def.fields.find((f) => f.ui.kind === 'text' || f.ui.kind === 'textarea')
  if (!firstText) return ''
  const v = data.value[firstText.name]
  return typeof v === 'string' && v ? v.slice(0, 80) : ''
})
</script>

<template>
  <NodeViewWrapper class="vulse-set my-2">
    <div v-if="!setDef" class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      <div class="font-medium">Missing set: {{ setHandle ?? '(unset)' }}</div>
      <button type="button" class="mt-1 text-xs text-amber-900 underline" @click="props.deleteNode()">Remove</button>
    </div>
    <div v-else class="rounded border border-zinc-200 bg-white">
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" class="flex flex-1 items-center gap-2 text-left text-sm" @click="expanded = !expanded">
          <span class="text-zinc-400">{{ expanded ? '▾' : '▸' }}</span>
          <span class="font-medium text-zinc-800">{{ setDef.label }}</span>
          <span v-if="!expanded && summary" class="truncate text-zinc-500">— {{ summary }}</span>
        </button>
        <button type="button" class="text-xs text-zinc-500 hover:text-red-700" @click="props.deleteNode()">Remove</button>
      </div>
      <div v-if="expanded" class="space-y-2 border-t border-zinc-200 p-3">
        <FieldRenderer
          v-for="f in fieldDescriptors"
          :key="f.path"
          :field="f"
          :model-value="data[f.path]"
          @update:modelValue="(v: unknown) => updateField(f.path, v)"
        />
      </div>
    </div>
  </NodeViewWrapper>
</template>
