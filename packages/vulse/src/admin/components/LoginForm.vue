<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ next: string }>()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const emailError = ref<string | null>(null)
const passwordError = ref<string | null>(null)
const loading = ref(false)
const forgotPasswordHref = computed(() => `/forgot-password?next=${encodeURIComponent(safeNext(props.next))}`)

// Step: 'credentials' (email + password) → 'twoFactor' (TOTP / backup code).
const step = ref<'credentials' | 'twoFactor'>('credentials')
const totpCode = ref('')
const totpError = ref<string | null>(null)
const useBackupCode = ref(false)

function safeNext(raw: string): string {
  // Only allow same-origin path redirects; reject protocol-relative ("//evil")
  // and absolute URLs.
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/admin'
  return raw
}

function clearErrors() {
  error.value = null
  emailError.value = null
  passwordError.value = null
  totpError.value = null
}

function validate() {
  clearErrors()
  const trimmedEmail = email.value.trim()
  if (!trimmedEmail) {
    emailError.value = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    emailError.value = 'Enter a valid email address.'
  }
  if (!password.value) {
    passwordError.value = 'Enter your password.'
  }
  return !emailError.value && !passwordError.value
}

function authErrorMessage(status: number, body: unknown): string {
  if (status === 400 || status === 401 || status === 403) return 'Email or password is incorrect.'
  const message = body && typeof body === 'object' && 'message' in body
    ? (body as { message: unknown }).message
    : null
  return typeof message === 'string' && message.trim() ? message : 'Could not sign in. Please try again.'
}

async function submit() {
  if (!validate()) return
  loading.value = true
  try {
    const res = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    })
    const body = await res.json().catch(() => null) as { twoFactorRedirect?: boolean } | null
    if (!res.ok) {
      error.value = authErrorMessage(res.status, body)
      return
    }
    if (body?.twoFactorRedirect) {
      step.value = 'twoFactor'
      totpCode.value = ''
      return
    }
    window.location.href = safeNext(props.next)
  } catch {
    error.value = 'Could not reach the sign-in service. Please try again.'
  } finally {
    loading.value = false
  }
}

async function submitTotp() {
  totpError.value = null
  const code = totpCode.value.trim().replace(/\s+/g, '')
  if (!code) {
    totpError.value = useBackupCode.value
      ? 'Enter one of your backup codes.'
      : 'Enter the 6-digit code from your authenticator app.'
    return
  }
  loading.value = true
  try {
    const endpoint = useBackupCode.value
      ? '/api/auth/two-factor/verify-backup-code'
      : '/api/auth/two-factor/verify-totp'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      totpError.value = useBackupCode.value
        ? 'That backup code is not valid. Each code works only once.'
        : 'That code is not valid. Try again.'
      return
    }
    window.location.href = safeNext(props.next)
  } catch {
    totpError.value = 'Could not reach the verification service. Please try again.'
  } finally {
    loading.value = false
  }
}

function toggleBackupCode() {
  useBackupCode.value = !useBackupCode.value
  totpCode.value = ''
  totpError.value = null
}

function cancelTwoFactor() {
  step.value = 'credentials'
  totpCode.value = ''
  totpError.value = null
  useBackupCode.value = false
}
</script>

<template>
  <form
    v-if="step === 'credentials'"
    novalidate
    class="w-80 space-y-4 rounded-xl border bg-white p-6 shadow-sm"
    @submit.prevent="submit"
  >
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <label class="block">
      <span class="text-sm text-zinc-600">Email</span>
      <input
        v-model="email"
        type="email"
        autocomplete="email"
        class="mt-1 w-full rounded border px-3 py-2"
        :class="emailError && 'border-red-400'"
        :aria-invalid="!!emailError"
        aria-describedby="vulse-login-email-error"
        @input="emailError = null; error = null"
      />
      <span v-if="emailError" id="vulse-login-email-error" class="mt-1 block text-sm text-red-600">
        {{ emailError }}
      </span>
    </label>
    <label class="block">
      <span class="text-sm text-zinc-600">Password</span>
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="mt-1 w-full rounded border px-3 py-2"
        :class="passwordError && 'border-red-400'"
        :aria-invalid="!!passwordError"
        aria-describedby="vulse-login-password-error"
        @input="passwordError = null; error = null"
      />
      <span v-if="passwordError" id="vulse-login-password-error" class="mt-1 block text-sm text-red-600">
        {{ passwordError }}
      </span>
    </label>
    <p v-if="error" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <button
      type="submit"
      :disabled="loading"
      class="vulse-button-primary w-full rounded px-4 py-2 font-medium disabled:opacity-50"
    >
      {{ loading ? 'Signing in…' : 'Sign in' }}
    </button>
    <p class="text-center text-sm text-zinc-500">
      <a :href="forgotPasswordHref" class="text-zinc-600 underline hover:text-zinc-900">Forgot password?</a>
    </p>
  </form>

  <form
    v-else
    novalidate
    class="w-80 space-y-4 rounded-xl border bg-white p-6 shadow-sm"
    @submit.prevent="submitTotp"
  >
    <h1 class="text-2xl font-semibold">Two-factor code</h1>
    <p class="text-sm text-zinc-600">
      {{ useBackupCode
        ? 'Enter one of the backup codes you saved when you enabled 2FA.'
        : 'Enter the 6-digit code from your authenticator app to finish signing in.' }}
    </p>
    <label class="block">
      <span class="text-sm text-zinc-600">{{ useBackupCode ? 'Backup code' : 'Authenticator code' }}</span>
      <input
        v-model="totpCode"
        :inputmode="useBackupCode ? 'text' : 'numeric'"
        :autocomplete="useBackupCode ? 'one-time-code' : 'one-time-code'"
        :pattern="useBackupCode ? undefined : '[0-9]*'"
        autofocus
        class="mt-1 w-full rounded border px-3 py-2 font-mono tracking-widest"
        :class="totpError && 'border-red-400'"
        :aria-invalid="!!totpError"
        @input="totpError = null"
      />
      <span v-if="totpError" class="mt-1 block text-sm text-red-600">{{ totpError }}</span>
    </label>
    <button
      type="submit"
      :disabled="loading"
      class="vulse-button-primary w-full rounded px-4 py-2 font-medium disabled:opacity-50"
    >
      {{ loading ? 'Verifying…' : 'Verify' }}
    </button>
    <div class="flex justify-between text-sm">
      <button type="button" class="text-zinc-600 underline hover:text-zinc-900" @click="toggleBackupCode">
        {{ useBackupCode ? 'Use authenticator app' : 'Use a backup code' }}
      </button>
      <button type="button" class="text-zinc-600 underline hover:text-zinc-900" @click="cancelTwoFactor">
        Cancel
      </button>
    </div>
  </form>
</template>
