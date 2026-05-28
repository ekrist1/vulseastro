<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

async function generateQRSvg(text: string): Promise<string> {
  // Use qrcode's toString/SVG path which avoids canvas/Node.js dependencies
  const { toString } = await import('qrcode')
  return toString(text, { type: 'svg', width: 220, margin: 1 })
}

const props = defineProps<{ initialEnabled: boolean }>()

type Phase = 'idle' | 'enabling' | 'verifying' | 'enabled' | 'disabling'

const enabled = ref(props.initialEnabled)
const phase = ref<Phase>(props.initialEnabled ? 'enabled' : 'idle')
const error = ref<string | null>(null)
const busy = ref(false)

const enrollPassword = ref('')
const enrollOtp = ref('')
const totpURI = ref('')
const qrSvg = ref('')
const backupCodes = ref<string[]>([])
const showBackupCodes = ref(false)

const disablePassword = ref('')

const regeneratePassword = ref('')
const regenerateOpen = ref(false)

function reset() {
  enrollPassword.value = ''
  enrollOtp.value = ''
  disablePassword.value = ''
  regeneratePassword.value = ''
  regenerateOpen.value = false
  totpURI.value = ''
  qrSvg.value = ''
  backupCodes.value = []
  showBackupCodes.value = false
  error.value = null
  phase.value = enabled.value ? 'enabled' : 'idle'
}

async function authPost<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const message = (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
        ? data.message
        : 'Request failed.'
      return { ok: false, status: res.status, message }
    }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server. Please try again.' }
  }
}

async function startEnroll() {
  if (!enrollPassword.value) { error.value = 'Enter your current password to continue.'; return }
  busy.value = true; error.value = null
  const res = await authPost<{ totpURI: string; backupCodes: string[] }>('/api/auth/two-factor/enable', {
    password: enrollPassword.value,
    issuer: 'Vulse',
  })
  busy.value = false
  if (!res.ok) {
    error.value = res.status === 401 || res.status === 403 ? 'That password is not correct.' : res.message
    return
  }
  try {
    totpURI.value = res.data.totpURI
    backupCodes.value = res.data.backupCodes ?? []
    qrSvg.value = await generateQRSvg(res.data.totpURI)
    phase.value = 'verifying'
  } catch {
    totpURI.value = ''
    qrSvg.value = ''
    backupCodes.value = []
    showBackupCodes.value = false
    error.value = 'Could not generate the QR code. Please try again.'
  }
}

async function verifyEnroll() {
  const code = enrollOtp.value.trim().replace(/\s+/g, '')
  if (!code) { error.value = 'Enter the 6-digit code from your authenticator app.'; return }
  busy.value = true; error.value = null
  const res = await authPost<unknown>('/api/auth/two-factor/verify-totp', { code })
  busy.value = false
  if (!res.ok) {
    error.value = 'That code is not valid. Try again.'
    return
  }
  enabled.value = true
  phase.value = 'enabled'
  enrollPassword.value = ''
  enrollOtp.value = ''
  // Keep backupCodes visible until the user explicitly closes; this is their
  // one chance to save them.
  showBackupCodes.value = true
}

async function disable2fa() {
  if (!disablePassword.value) { error.value = 'Enter your current password to confirm.'; return }
  busy.value = true; error.value = null
  const res = await authPost<unknown>('/api/auth/two-factor/disable', { password: disablePassword.value })
  busy.value = false
  if (!res.ok) {
    error.value = res.status === 401 || res.status === 403 ? 'That password is not correct.' : res.message
    return
  }
  enabled.value = false
  reset()
}

async function regenerateBackupCodes() {
  if (!regeneratePassword.value) { error.value = 'Enter your current password to confirm.'; return }
  busy.value = true; error.value = null
  const res = await authPost<{ backupCodes: string[] }>('/api/auth/two-factor/generate-backup-codes', {
    password: regeneratePassword.value,
  })
  busy.value = false
  if (!res.ok) {
    error.value = res.status === 401 || res.status === 403 ? 'That password is not correct.' : res.message
    return
  }
  backupCodes.value = res.data.backupCodes ?? []
  showBackupCodes.value = true
  regeneratePassword.value = ''
  regenerateOpen.value = false
}

function copyBackupCodes() {
  const text = backupCodes.value.join('\n')
  void navigator.clipboard?.writeText(text)
}

function downloadBackupCodes() {
  const text = `Vulse backup codes\n\nEach code may be used once if you lose access to your authenticator app.\n\n${backupCodes.value.join('\n')}\n`
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'vulse-backup-codes.txt'
  a.click()
  URL.revokeObjectURL(url)
}

watch(phase, () => { error.value = null })
onMounted(() => { phase.value = enabled.value ? 'enabled' : 'idle' })
</script>

<template>
  <div class="space-y-4">
    <p v-if="error" class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>

    <div v-if="phase === 'idle'">
      <p class="mb-3 text-sm">
        <span class="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
          Off
        </span>
      </p>
      <form class="space-y-3" @submit.prevent="startEnroll">
        <label class="block">
          <span class="block text-sm text-zinc-600">Confirm your password</span>
          <input
            v-model="enrollPassword"
            type="password"
            autocomplete="current-password"
            class="mt-1 w-full max-w-sm rounded border px-2 py-1.5 text-sm"
          >
        </label>
        <button
          type="submit"
          :disabled="busy"
          class="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {{ busy ? 'Generating…' : 'Enable two-factor authentication' }}
        </button>
      </form>
    </div>

    <div v-else-if="phase === 'verifying'" class="space-y-4">
      <div class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Scan this QR code with your authenticator app, then enter the 6-digit code to finish.
      </div>
      <div class="flex flex-col items-start gap-4 md:flex-row">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="qrSvg" class="rounded border" style="width:220px;height:220px" v-html="qrSvg" />
        <div class="flex-1 text-sm">
          <p class="mb-1 text-zinc-600">Can't scan? Add an account manually using this secret:</p>
          <code class="block break-all rounded bg-zinc-100 px-2 py-1 text-xs">{{ totpURI }}</code>
        </div>
      </div>
      <form class="space-y-3" @submit.prevent="verifyEnroll">
        <label class="block">
          <span class="block text-sm text-zinc-600">Authenticator code</span>
          <input
            v-model="enrollOtp"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="mt-1 w-full max-w-xs rounded border px-2 py-1.5 font-mono tracking-widest"
          >
        </label>
        <div class="flex items-center gap-2">
          <button
            type="submit"
            :disabled="busy"
            class="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {{ busy ? 'Verifying…' : 'Verify and enable' }}
          </button>
          <button
            type="button"
            class="text-sm text-zinc-600 hover:underline"
            @click="reset"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <div v-else-if="phase === 'enabled'" class="space-y-4">
      <p class="text-sm">
        <span class="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          On
        </span>
      </p>

      <div v-if="showBackupCodes && backupCodes.length" class="rounded border border-amber-300 bg-amber-50 p-4">
        <h3 class="text-sm font-semibold text-amber-900">Save your backup codes</h3>
        <p class="mt-1 text-sm text-amber-900">
          Each code can be used once to sign in if you lose access to your authenticator app.
          You won't be able to see them again — store them somewhere safe.
        </p>
        <ul class="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">
          <li v-for="c in backupCodes" :key="c" class="rounded bg-white px-2 py-1">{{ c }}</li>
        </ul>
        <div class="mt-3 flex items-center gap-2">
          <button type="button" class="rounded border bg-white px-2 py-1 text-xs" @click="copyBackupCodes">Copy</button>
          <button type="button" class="rounded border bg-white px-2 py-1 text-xs" @click="downloadBackupCodes">Download</button>
          <button type="button" class="ml-auto text-xs text-zinc-600 hover:underline" @click="showBackupCodes = false">
            I've saved them
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-start gap-6">
        <form class="space-y-2" @submit.prevent="disable2fa">
          <h3 class="text-sm font-semibold">Disable two-factor</h3>
          <input
            v-model="disablePassword"
            type="password"
            autocomplete="current-password"
            placeholder="Current password"
            class="block w-64 rounded border px-2 py-1.5 text-sm"
          >
          <button
            type="submit"
            :disabled="busy"
            class="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Disable 2FA
          </button>
        </form>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">Backup codes</h3>
          <p class="max-w-sm text-sm text-zinc-600">
            Generate a fresh set if you've used them or lost track. Old codes will stop working.
          </p>
          <button
            v-if="!regenerateOpen"
            type="button"
            class="rounded border bg-white px-3 py-1.5 text-sm"
            @click="regenerateOpen = true"
          >
            Regenerate backup codes
          </button>
          <form v-else class="space-y-2" @submit.prevent="regenerateBackupCodes">
            <input
              v-model="regeneratePassword"
              type="password"
              autocomplete="current-password"
              placeholder="Current password"
              class="block w-64 rounded border px-2 py-1.5 text-sm"
            >
            <div class="flex items-center gap-2">
              <button
                type="submit"
                :disabled="busy"
                class="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Generate
              </button>
              <button type="button" class="text-sm text-zinc-600 hover:underline" @click="regenerateOpen = false; regeneratePassword = ''">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
