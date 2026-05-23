<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api.js'

const allowMemberSignUp = ref(false)
const allowedDomains = ref<string[]>([])
const saving = ref(false)
const saved = ref(false)

async function load() {
  const all = await adminApi.get<Record<string, unknown>>('/api/vulse/settings')
  allowMemberSignUp.value = !!all.allowMemberSignUp
  allowedDomains.value = (all.allowedSignUpDomains as string[]) ?? []
}

async function save() {
  saving.value = true
  saved.value = false
  try {
    await adminApi.put('/api/vulse/settings/allowMemberSignUp', { value: allowMemberSignUp.value })
    await adminApi.put('/api/vulse/settings/allowedSignUpDomains', { value: allowedDomains.value })
    saved.value = true
  } finally {
    saving.value = false
  }
}

function onDomainsInput(e: Event) {
  allowedDomains.value = (e.target as HTMLInputElement).value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

onMounted(load)
</script>

<template>
  <div class="vulse-panel max-w-md space-y-4">
    <label class="flex items-center gap-2">
      <input v-model="allowMemberSignUp" type="checkbox" class="rounded border-zinc-300" />
      <span class="text-sm">Allow public member sign-up</span>
    </label>
    <label class="block">
      <span class="vulse-label">Allowed email domains (comma-separated; blank = any)</span>
      <input
        :value="allowedDomains.join(', ')"
        class="vulse-input mt-1"
        placeholder="example.com, company.org"
        @change="onDomainsInput"
      />
    </label>
    <div class="flex items-center gap-3">
      <button type="button" class="vulse-button-primary px-4 py-2 text-sm" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <span v-if="saved" class="text-sm text-zinc-500">Saved.</span>
    </div>
  </div>
</template>
