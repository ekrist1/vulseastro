<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { adminApi, AdminApiError } from '../client/api.js'
import { fieldDescriptorsFromDefinitions } from '../client/form-from-zod.js'
import type { FieldDescriptor } from '../client/form-from-zod.js'
import type { FieldDefinition } from '../../core/blueprints/definition.js'
import FieldRenderer from './fields/FieldRenderer.vue'

const props = defineProps<{ handle: string | null }>()

const handle = ref('')
const label = ref('')
const fields = reactive<FieldDefinition[]>([])
const content = reactive<Record<string, unknown>>({})
const fieldErrors = reactive<Record<string, string>>({})
const savingDefinition = ref(false)
const savingValue = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const handleLocked = ref(false)

const isCreate = computed(() => props.handle === null)
const fieldDescriptors = computed<FieldDescriptor[]>(() => fieldDescriptorsFromDefinitions(fields))
const canEditValue = computed(() => !isCreate.value && fields.length > 0)

function slugify(input: string): string {
  return input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '')
}

function defaultFor(kind: string): unknown {
  if (kind === 'boolean') return false
  if (kind === 'blocks') return { type: 'doc', content: [{ type: 'paragraph' }] }
  if (kind === 'date') {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return ''
}

function ensureContentFields() {
  for (const field of fields) {
    if (!(field.name in content)) content[field.name] = field.default ?? defaultFor(field.ui.kind)
  }
}

watch(label, (v) => {
  if (isCreate.value && !handleLocked.value) handle.value = slugify(v)
})

function onHandleInput(e: Event) {
  handleLocked.value = true
  handle.value = (e.target as HTMLInputElement).value
}

async function load() {
  for (const key of Object.keys(content)) delete content[key]
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
  error.value = null

  if (props.handle === null) {
    handle.value = ''
    label.value = ''
    fields.splice(0)
    handleLocked.value = false
    return
  }

  loading.value = true
  try {
    const result = await adminApi.get<{
      set: { handle: string; label: string; fields: FieldDefinition[] }
      value: { content: Record<string, unknown> } | null
    }>(`/api/vulse/globals/${props.handle}`)
    handle.value = result.set.handle
    label.value = result.set.label
    fields.splice(0, fields.length, ...result.set.fields)
    handleLocked.value = true
    ensureContentFields()
    Object.assign(content, result.value?.content ?? {})
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.handle, load)

function addField() {
  fields.push({ name: '', ui: { kind: 'text' }, optional: false })
}

function removeField(index: number) {
  const [field] = fields.splice(index, 1)
  if (field?.name) delete content[field.name]
}

function updateFieldName(index: number, event: Event) {
  const field = fields[index]
  if (!field) return
  const oldName = field.name
  const newName = (event.target as HTMLInputElement).value
  field.name = newName
  if (oldName && oldName in content && !(newName in content)) {
    content[newName] = content[oldName]
    delete content[oldName]
  }
}

function formatApiError(e: unknown): string {
  if (!(e instanceof AdminApiError)) return e instanceof Error ? e.message : 'Save failed'
  const issues = (e.details as { issues?: Array<{ path?: (string | number)[]; message?: string }> } | undefined)?.issues
  if (issues?.length) {
    return issues.map((issue) => {
      const path = issue.path?.length ? issue.path.join('.') : 'form'
      return `${path}: ${issue.message ?? 'invalid'}`
    }).join('; ')
  }
  return e.message
}

function applyValueErrors(e: AdminApiError) {
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
  const issues = (e.details as { issues?: Array<{ path?: (string | number)[]; message?: string }> } | undefined)?.issues
  if (issues?.length) {
    for (const issue of issues) {
      const field = String(issue.path?.[0] ?? '')
      if (field) fieldErrors[field] = issue.message ?? 'Invalid'
    }
    return
  }
  error.value = e.message
}

async function saveDefinition() {
  error.value = null
  for (const field of fields) {
    if (!field.name.trim()) {
      error.value = 'Each field must have a name.'
      return
    }
  }
  savingDefinition.value = true
  try {
    const body = { handle: handle.value, label: label.value, fields: [...fields] }
    if (isCreate.value) {
      await adminApi.post('/api/vulse/globals', body)
      window.location.href = `/admin/settings/globals/${handle.value}`
    } else {
      await adminApi.put(`/api/vulse/globals/${props.handle}`, body)
      ensureContentFields()
    }
  } catch (e) {
    error.value = formatApiError(e)
  } finally {
    savingDefinition.value = false
  }
}

async function saveValue() {
  if (isCreate.value) return
  error.value = null
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
  savingValue.value = true
  try {
    await adminApi.put(`/api/vulse/globals/${props.handle}/value`, { ...content })
  } catch (e) {
    if (e instanceof AdminApiError) applyValueErrors(e)
    else error.value = 'Save failed'
  } finally {
    savingValue.value = false
  }
}

async function destroy() {
  if (!props.handle || !confirm(`Delete global set "${props.handle}"?`)) return
  await adminApi.delete(`/api/vulse/globals/${props.handle}`)
  window.location.href = '/admin/settings/globals'
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">{{ isCreate ? 'New global set' : label }}</h1>
        <p class="mt-1 text-sm text-zinc-500">Globals are site-wide content available to the frontend on every page.</p>
      </div>
      <button v-if="!isCreate" type="button" class="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700" @click="destroy">Delete</button>
    </div>

    <p v-if="loading" class="text-sm text-zinc-500">Loading…</p>
    <div v-else class="grid max-w-5xl gap-6 lg:grid-cols-2">
      <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <h2 class="text-sm font-semibold text-zinc-700">Definition</h2>
          <p class="mt-1 text-xs text-zinc-500">Define the fields editors can fill in for this global set.</p>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Label</span>
          <input v-model="label" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Handle</span>
          <input :value="handle" :disabled="!isCreate" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100" @input="onHandleInput" />
        </label>

        <div>
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-zinc-700">Fields</h3>
            <button type="button" class="rounded-lg border border-zinc-300 px-2 py-1 text-xs" @click="addField">+ Add field</button>
          </div>
          <div v-for="(f, i) in fields" :key="i" class="mb-3 rounded-lg border border-zinc-100 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <input :value="f.name" placeholder="name" class="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm" @input="updateFieldName(i, $event)" />
              <input v-model="f.label" placeholder="label" class="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm" />
              <select v-model="f.ui.kind" class="rounded border border-zinc-300 px-2 py-1 text-sm">
                <option value="text">text</option>
                <option value="textarea">textarea</option>
                <option value="blocks">blocks</option>
                <option value="date">date</option>
                <option value="boolean">boolean</option>
                <option value="select">select</option>
                <option value="asset">asset</option>
              </select>
              <label class="flex items-center gap-1 text-xs"><input v-model="f.optional" type="checkbox" /> optional</label>
              <button type="button" class="text-xs text-red-600" @click="removeField(i)">Remove</button>
            </div>
          </div>
        </div>

        <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
        <button type="button" class="vulse-button-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50" :disabled="savingDefinition" @click="saveDefinition">
          {{ savingDefinition ? 'Saving…' : (isCreate ? 'Create set' : 'Save definition') }}
        </button>
      </section>

      <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <h2 class="text-sm font-semibold text-zinc-700">Content</h2>
          <p class="mt-1 text-xs text-zinc-500">Values exposed via the public globals API.</p>
        </div>

        <p v-if="isCreate" class="text-sm text-zinc-500">Save the definition first to edit content.</p>
        <p v-else-if="fields.length === 0" class="text-sm text-zinc-500">Add fields to the definition to edit content.</p>
        <template v-else>
          <FieldRenderer
            v-for="fd in fieldDescriptors"
            :key="fd.path"
            :field="fd"
            :model-value="content[fd.path]"
            @update:modelValue="content[fd.path] = $event"
          />
          <p v-for="(msg, name) in fieldErrors" :key="name" class="text-sm text-red-600">{{ name }}: {{ msg }}</p>
          <button type="button" class="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50" :disabled="savingValue || !canEditValue" @click="saveValue">
            {{ savingValue ? 'Saving…' : 'Save content' }}
          </button>
        </template>
      </section>
    </div>
  </div>
</template>
