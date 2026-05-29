<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { adminApi, AdminApiError } from '../client/api.js'
import { useToast } from '../composables/toast.js'

const toast = useToast()
import type { FormDefinition, FormFieldDefinition } from '../../core/forms/definition.js'

interface FormRow {
  handle: string
  label: string
  definition: FormDefinition
  enabled: boolean
}

const props = defineProps<{ handle: string | null }>()

const tab = ref<'fields' | 'settings' | 'emails' | 'embed'>('fields')
const handle = ref('')
const label = ref('')
const fields = reactive<FormFieldDefinition[]>([])
const settings = reactive({
  enabled: true,
  successMessage: 'Thank you!',
  redirectTo: '',
  honeypotField: '_hp',
  notifyEmails: [] as string[],
  confirmationEmail: {
    enabled: false,
    toField: 'email',
    subject: 'Thanks for your submission',
    bodyTemplate: 'We received your message.',
  },
})
const saving = ref(false)
const error = ref<string | null>(null)
const handleLocked = ref(false)

const isCreate = computed(() => props.handle === null)

const embedSnippet = computed(() => `<FormRenderer form="${handle.value || 'my-form'}">
  <!-- your field markup -->
</FormRenderer>`)

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
  const row = await adminApi.get<FormRow>(`/api/vulse/forms/${props.handle}`)
  handle.value = row.handle
  label.value = row.label
  handleLocked.value = true
  fields.splice(0, fields.length, ...row.definition.fields)
  Object.assign(settings, {
    enabled: row.enabled,
    successMessage: row.definition.settings.successMessage ?? 'Thank you!',
    redirectTo: row.definition.settings.redirectTo ?? '',
    honeypotField: row.definition.settings.honeypotField ?? '_hp',
    notifyEmails: row.definition.settings.notifyEmails ?? [],
    confirmationEmail: row.definition.settings.confirmationEmail ?? settings.confirmationEmail,
  })
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

onMounted(load)
watch(() => props.handle, load)

function addField() {
  fields.push({ name: '', ui: { kind: 'text' }, optional: false })
}

function buildDefinition(): FormDefinition {
  return {
    handle: handle.value,
    label: label.value,
    fields: [...fields],
    settings: {
      enabled: settings.enabled,
      successMessage: settings.successMessage,
      redirectTo: settings.redirectTo || undefined,
      honeypotField: settings.honeypotField,
      notifyEmails: settings.notifyEmails.filter(Boolean),
      confirmationEmail: settings.confirmationEmail.enabled ? settings.confirmationEmail : undefined,
    },
    actions: [],
  }
}

async function save() {
  error.value = null
  for (const field of fields) {
    if (!field.name.trim()) {
      error.value = 'Each field must have a name.'
      return
    }
  }
  saving.value = true
  try {
    const body = buildDefinition()
    if (isCreate.value) {
      await adminApi.post('/api/vulse/forms', body)
      window.location.href = `/admin/forms/${handle.value}`
    } else {
      await adminApi.put(`/api/vulse/forms/${props.handle}`, body)
      toast.success('Form saved.')
    }
  } catch (e) {
    error.value = formatApiError(e)
  } finally {
    saving.value = false
  }
}

async function destroy() {
  if (!props.handle || !confirm(`Delete form "${props.handle}"?`)) return
  await adminApi.delete(`/api/vulse/forms/${props.handle}`)
  window.location.href = '/admin/forms'
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ isCreate ? 'New form' : label }}</h1>
      <a v-if="!isCreate" :href="`/admin/forms/${handle}/submissions`" class="text-sm text-zinc-600 hover:underline">View submissions</a>
    </div>

    <div class="mb-4 flex gap-2 border-b border-zinc-200">
      <button v-for="t in ['fields', 'settings', 'emails', 'embed'] as const" :key="t" type="button"
        class="px-3 py-2 text-sm capitalize" :class="tab === t && 'border-b-2 border-zinc-900 font-medium'" @click="tab = t">
        {{ t }}
      </button>
    </div>

    <div class="max-w-3xl space-y-4">
      <div class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Label</span>
          <input v-model="label" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Handle</span>
          <input :value="handle" :disabled="!isCreate" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100" @input="onHandleInput" />
        </label>
      </div>

      <div v-show="tab === 'fields'" class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-zinc-700">Fields</h2>
          <button type="button" class="rounded-lg border border-zinc-300 px-2 py-1 text-xs" @click="addField">+ Add field</button>
        </div>
        <div v-for="(f, i) in fields" :key="i" class="mb-3 rounded-lg border border-zinc-100 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <input v-model="f.name" placeholder="name" class="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm" />
            <input v-model="f.label" placeholder="label" class="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm" />
            <select v-model="f.ui.kind" class="rounded border border-zinc-300 px-2 py-1 text-sm">
              <option value="text">text</option>
              <option value="textarea">textarea</option>
              <option value="email">email</option>
              <option value="number">number</option>
              <option value="select">select</option>
              <option value="checkbox">checkbox</option>
              <option value="radio">radio</option>
              <option value="date">date</option>
              <option value="file">file</option>
              <option value="hidden">hidden</option>
              <option value="honeypot">honeypot</option>
              <option value="submit">submit</option>
            </select>
            <label class="flex items-center gap-1 text-xs"><input v-model="f.optional" type="checkbox" /> optional</label>
            <label v-if="f.validation" class="flex items-center gap-1 text-xs"><input v-model="f.validation.unique" type="checkbox" /> unique</label>
            <button type="button" class="text-xs text-red-600" @click="fields.splice(i, 1)">Remove</button>
          </div>
        </div>
      </div>

      <div v-show="tab === 'settings'" class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label class="flex items-center gap-2 text-sm"><input v-model="settings.enabled" type="checkbox" /> Enabled</label>
        <label class="block text-sm">Success message<input v-model="settings.successMessage" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1" /></label>
        <label class="block text-sm">Redirect URL (optional)<input v-model="settings.redirectTo" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1" /></label>
        <label class="block text-sm">Honeypot field<input v-model="settings.honeypotField" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1" /></label>
      </div>

      <div v-show="tab === 'emails'" class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label class="block text-sm">Notify emails (comma-separated)
          <input :value="settings.notifyEmails.join(', ')" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            @input="settings.notifyEmails = ($event.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean)" />
        </label>
        <label class="flex items-center gap-2 text-sm"><input v-model="settings.confirmationEmail.enabled" type="checkbox" /> Send confirmation email</label>
        <template v-if="settings.confirmationEmail.enabled">
          <label class="block text-sm">To field<input v-model="settings.confirmationEmail.toField" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1" /></label>
          <label class="block text-sm">Subject<input v-model="settings.confirmationEmail.subject" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1" /></label>
          <label class="block text-sm">Body<textarea v-model="settings.confirmationEmail.bodyTemplate" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1" rows="4" /></label>
        </template>
      </div>

      <div v-show="tab === 'embed'" class="rounded-xl border border-zinc-200 bg-white p-4">
        <pre class="overflow-x-auto rounded bg-zinc-50 p-3 text-xs">{{ embedSnippet }}</pre>
      </div>

      <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        <button v-if="!isCreate" type="button" class="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700" @click="destroy">Delete</button>
      </div>
    </div>
  </div>
</template>
