<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { adminApi } from '../client/api.js'

const props = defineProps<{ userId: string }>()

interface UserRecord {
  id: string
  email: string
  name: string
  role: 'admin' | 'editor' | 'member'
  displayName: string | null
}

const form = reactive({
  name: '',
  displayName: '',
  role: 'member' as UserRecord['role'],
})
const email = ref('')
const loading = ref(true)
const saving = ref(false)
const resetSending = ref(false)
const settingPassword = ref(false)
const newPassword = ref('')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const user = await adminApi.get<UserRecord>(`/api/vulse/users/${props.userId}`)
    email.value = user.email
    form.name = user.name
    form.displayName = user.displayName ?? ''
    form.role = user.role
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load user'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function save() {
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await adminApi.patch(`/api/vulse/users/${props.userId}`, {
      name: form.name,
      displayName: form.displayName || null,
      role: form.role,
    })
    notice.value = 'User saved.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

async function sendResetEmail() {
  resetSending.value = true
  error.value = null
  notice.value = null
  try {
    await adminApi.post(`/api/vulse/users/${props.userId}/reset-password`, { action: 'email' })
    notice.value = 'Password reset email sent (or logged in development).'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not send reset email'
  } finally {
    resetSending.value = false
  }
}

async function setPassword() {
  if (newPassword.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  settingPassword.value = true
  error.value = null
  notice.value = null
  try {
    await adminApi.post(`/api/vulse/users/${props.userId}/reset-password`, {
      action: 'set',
      password: newPassword.value,
    })
    newPassword.value = ''
    notice.value = 'Password updated.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not set password'
  } finally {
    settingPassword.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center gap-3">
      <a href="/admin/users" class="text-sm text-zinc-500 hover:text-zinc-800">← Users</a>
    </div>

    <div v-if="loading" class="text-sm text-zinc-500">Loading…</div>

    <div v-else class="max-w-xl space-y-6">
      <h1 class="text-2xl font-semibold">Edit user</h1>

      <div class="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Email</span>
          <input :value="email" disabled class="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Name</span>
          <input v-model="form.name" required class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Display name</span>
          <input v-model="form.displayName" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <span class="mt-1 block text-xs text-zinc-500">Optional public-facing name.</span>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-zinc-700">Role</span>
          <select v-model="form.role" class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="member">member</option>
          </select>
        </label>
      </div>

      <div class="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-zinc-700">Password</h2>
        <p class="text-sm text-zinc-500">Send a reset link to the user's email, or set a new password directly.</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-zinc-300 px-4 py-2 text-sm"
            :disabled="resetSending"
            @click="sendResetEmail"
          >
            {{ resetSending ? 'Sending…' : 'Send reset email' }}
          </button>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <label class="block flex-1 min-w-[12rem]">
            <span class="text-sm font-medium text-zinc-700">Set new password</span>
            <input
              v-model="newPassword"
              type="password"
              minlength="8"
              autocomplete="new-password"
              class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="At least 8 characters"
            />
          </label>
          <button
            type="button"
            class="rounded-lg border border-zinc-300 px-4 py-2 text-sm"
            :disabled="settingPassword || !newPassword"
            @click="setPassword"
          >
            {{ settingPassword ? 'Updating…' : 'Set password' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="notice" class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{{ notice }}</div>

      <button
        type="button"
        class="vulse-button-primary rounded-lg px-4 py-2 text-sm font-medium"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save changes' }}
      </button>
    </div>
  </div>
</template>
