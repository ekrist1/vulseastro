import { ref } from 'vue'

export type ToastKind = 'success' | 'error'

export interface ToastMessage {
  id: number
  message: string
  kind: ToastKind
}

const toasts = ref<ToastMessage[]>([])
let nextId = 1

function push(message: string, kind: ToastKind, durationMs: number) {
  const id = nextId++
  toasts.value = [...toasts.value, { id, message, kind }]
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, durationMs)
}

export function useToast() {
  return {
    toasts,
    success(message: string, durationMs = 2800) {
      push(message, 'success', durationMs)
    },
    error(message: string, durationMs = 4000) {
      push(message, 'error', durationMs)
    },
    dismiss(id: number) {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    },
  }
}
