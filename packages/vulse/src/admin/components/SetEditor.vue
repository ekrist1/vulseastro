<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { adminApi } from '../client/api.js'
import type { NestedFieldDefinition } from '../../core/blueprints/definition.js'
import type { SetDefinition } from '../../core/sets/definition.js'

const props = defineProps<{ handle: string | null }>()

const handle = ref('')
const label = ref('')
const fields = reactive<NestedFieldDefinition[]>([])
const saving = ref(false)
const error = ref<string | null>(null)
const handleLocked = ref(false)

const isCreate = computed(() => props.handle === null)

function slugify(input: string): string {
  return input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '')
}

watch(label, (v) => {
  if (isCreate.value && !handleLocked.value) handle.value = slugify(v)
})

function onHandleInput(e: Event) {
  handleLocked.value = true
  handle.value = (e.target as HTMLInputElement).value
}

async function load() {
  if (props.handle === null) {
    handle.value = ''
    label.value = ''
    fields.splice(0)
    handleLocked.value = false
    return
  }
  const s = await adminApi.get<SetDefinition>(`/api/vulse/sets/${props.handle}`)
  handle.value = s.handle
  label.value = s.label
  handleLocked.value = true
  fields.splice(0, fields.length, ...s.fields)
}

onMounted(load)
watch(() => props.handle, load)

function addField() {
  fields.push({ name: '', ui: { kind: 'text' }, optional: false })
}

async function save() {
  saving.value = true
  error.value = null
  try {
    const body = { handle: handle.value, label: label.value, fields: [...fields] }
    if (isCreate.value) {
      await adminApi.post('/api/vulse/sets', body)
      window.location.href = '/admin/settings/sets'
    } else {
      await adminApi.patch(`/api/vulse/sets/${props.handle}`, body)
      window.location.href = '/admin/settings/sets'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

async function destroy() {
  if (!props.handle || !confirm(`Delete set "${props.handle}"?`)) return
  await adminApi.delete(`/api/vulse/sets/${props.handle}`)
  window.location.href = '/admin/settings/sets'
}
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">{{ isCreate ? 'New set' : `Edit ${handle}` }}</h1>
    <div class="max-w-3xl space-y-4">
      <div class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Label</span>
          <input v-model="label" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Handle</span>
          <input :value="handle" :disabled="!isCreate" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100" @input="onHandleInput" />
          <span class="mt-1 block text-xs text-zinc-500">
            <template v-if="isCreate">
              Stable identifier referenced by blueprints (in <code>blocks</code> and <code>replicator</code> fields) and any frontend code that renders this set.
            </template>
            <template v-else>
              Locked — changing it would break every blueprint and frontend reference to this set. Create a new set and migrate to rename.
            </template>
          </span>
        </label>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-zinc-700">Fields</h2>
          <button type="button" class="rounded-lg border border-zinc-300 px-2 py-1 text-xs" @click="addField">+ Add field</button>
        </div>
        <div v-for="(f, i) in fields" :key="i" class="mb-3 rounded-lg border border-zinc-100 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <input v-model="f.name" placeholder="name" class="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm" />
            <select v-model="f.ui.kind" class="rounded border border-zinc-300 px-2 py-1 text-sm">
              <option value="text">text</option>
              <option value="textarea">textarea</option>
              <option value="blocks">blocks</option>
              <option value="date">date</option>
              <option value="boolean">boolean</option>
              <option value="select">select</option>
              <option value="relationship">relationship</option>
              <option value="entry">entry</option>
              <option value="entries">entries</option>
              <option value="link">link</option>
              <option value="asset">asset</option>
            </select>
            <label class="flex items-center gap-1 text-xs"><input v-model="f.optional" type="checkbox" /> optional</label>
            <button type="button" class="text-xs text-red-600" @click="fields.splice(i, 1)">Remove</button>
          </div>
        </div>
      </div>

      <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div class="flex items-center gap-2">
        <button type="button" class="vulse-button-primary rounded-lg px-4 py-2 text-sm font-medium" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        <button v-if="!isCreate" type="button" class="ml-auto rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600" @click="destroy">Delete</button>
      </div>
    </div>
  </div>
</template>
