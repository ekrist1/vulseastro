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
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      error.value = authErrorMessage(res.status, body)
      return
    }
    window.location.href = safeNext(props.next)
  } catch {
    error.value = 'Could not reach the sign-in service. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form novalidate class="w-80 space-y-4 rounded-xl border bg-white p-6 shadow-sm" @submit.prevent="submit">
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
</template>
