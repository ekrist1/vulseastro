<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, onMounted, watch } from 'vue'
import { useSets } from '../../composables/useSets.js'
import { EMPTY_BLOCKS_DOC, blocksEditorExtensions } from './blocks-editor-extensions.js'
import { sanitizeLinkHref } from './url-utils.js'

const props = defineProps<{
  label: string
  modelValue: unknown
  error?: string
  blocksSets?: string[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: unknown): void }>()

const { get, hydrate } = useSets()
onMounted(() => { void hydrate() })

const availableSetHandles = computed<string[]>(() => {
  const declared = props.blocksSets ?? []
  return declared.filter((h) => !!get(h))
})

function insertSet(handle: string) {
  if (!handle) return
  editor.value?.chain().focus().insertVulseSet(handle).run()
}

const editor = useEditor({
  extensions: blocksEditorExtensions,
  content: (props.modelValue as object) ?? EMPTY_BLOCKS_DOC,
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getJSON())
  },
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editor.value) return
    const current = JSON.stringify(editor.value.getJSON())
    const incoming = JSON.stringify(v)
    if (current !== incoming && v) {
      editor.value.commands.setContent(v as object, false)
    }
  },
)

function insertCallout(tone: 'info' | 'warn') {
  editor.value?.chain().focus().insertVulseCallout(tone).run()
}

function toggleLink() {
  const currentHref = (editor.value?.getAttributes('link').href as string | undefined) ?? ''
  const raw = window.prompt('Link URL', currentHref)
  if (raw === null) return
  const href = sanitizeLinkHref(raw)
  if (!href) {
    editor.value?.chain().focus().unsetVulseLink().run()
    return
  }
  if (editor.value?.state.selection.empty) {
    editor.value?.chain().focus()
      .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
      .run()
    return
  }
  editor.value?.chain().focus().extendMarkRange('link').setVulseLink(href).run()
}

function insertEmoji() {
  const value = window.prompt('Emoji', '🙂')
  if (!value?.trim()) return
  editor.value?.chain().focus().insertEmoji(value.trim()).run()
}

function insertAccordion() {
  editor.value?.chain().focus().insertVulseAccordionGroup('Accordion').run()
}

function insertIframe() {
  editor.value?.chain().focus().insertVulseIframe().run()
}

function insertVideo() {
  editor.value?.chain().focus().insertVulseVideo().run()
}
</script>

<template>
  <div :data-testid="`field-${label}`">
    <span class="block text-sm font-medium text-zinc-700 capitalize">{{ label }}</span>
    <div class="mt-1 rounded border border-zinc-300 bg-white">
      <div class="flex flex-wrap gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-xs">
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="editor?.chain().focus().toggleBold().run()">B</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200 italic" @click="editor?.chain().focus().toggleItalic().run()">I</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="toggleLink">Link</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="editor?.chain().focus().toggleHeading({ level: 4 }).run()">H4</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="editor?.chain().focus().toggleBulletList().run()">• List</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="editor?.chain().focus().toggleOrderedList().run()">1. List</button>
        <span class="mx-1 w-px bg-zinc-300" />
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="insertEmoji">Emoji</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="insertCallout('info')">+ Info</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="insertCallout('warn')">+ Warn</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="insertAccordion">Accordion</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="insertIframe">Iframe</button>
        <button type="button" class="rounded px-2 py-1 hover:bg-zinc-200" @click="insertVideo">Video</button>
        <select
          v-if="availableSetHandles.length > 0"
          class="rounded border border-zinc-300 px-2 py-1 text-xs"
          @change="insertSet(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
        >
          <option value="" disabled selected>+ Insert set</option>
          <option v-for="h in availableSetHandles" :key="h" :value="h">{{ get(h)?.label ?? h }}</option>
        </select>
      </div>
      <EditorContent v-if="editor" :editor="editor" class="prose max-w-none p-3 text-sm" />
    </div>
    <span v-if="error" class="mt-1 block text-xs text-red-600">{{ error }}</span>
  </div>
</template>
