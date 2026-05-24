<script setup lang="ts">
import { useToast } from '../composables/toast.js'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    aria-live="polite"
    aria-relevant="additions"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
      :class="toast.kind === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-red-200 bg-red-50 text-red-900'"
      role="status"
    >
      <span class="flex-1">{{ toast.message }}</span>
      <button
        type="button"
        class="rounded px-1 text-xs opacity-70 hover:opacity-100"
        aria-label="Dismiss notification"
        @click="dismiss(toast.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>
