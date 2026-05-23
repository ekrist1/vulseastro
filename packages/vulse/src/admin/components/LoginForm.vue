<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ next: string }>()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function submit(e: Event) {
  e.preventDefault()
  loading.value = true
  error.value = null
  const res = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: window.location.origin,
    },
    body: JSON.stringify({ email: email.value, password: password.value }),
  })
  loading.value = false
  if (!res.ok) { error.value = 'Invalid email or password'; return }
  window.location.href = props.next
}
</script>

<template>
  <form @submit="submit" class="w-80 p-6 rounded-xl shadow-sm border bg-white space-y-4">
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <label class="block">
      <span class="text-sm text-zinc-600">Email</span>
      <input v-model="email" type="email" required class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <label class="block">
      <span class="text-sm text-zinc-600">Password</span>
      <input v-model="password" type="password" required class="mt-1 w-full rounded border px-3 py-2" />
    </label>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <button :disabled="loading" class="w-full rounded bg-brand py-2 text-white font-medium disabled:opacity-50">
      {{ loading ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
