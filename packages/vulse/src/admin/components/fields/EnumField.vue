<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string | string[]
  label: string
  options: { key: string; label: string }[]
  multiple?: boolean
  placeholder?: string
  clearable?: boolean
  required?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string | string[]): void }>()

const normalizedOptions = computed(() =>
  props.options.length > 0 ? props.options : [{ key: '', label: '—' }],
)

function onSingleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value)
}

function onMultipleChange(event: Event) {
  const select = event.target as HTMLSelectElement
  emit(
    'update:modelValue',
    Array.from(select.selectedOptions).map((o) => o.value),
  )
}

function clearSingle() {
  emit('update:modelValue', '')
}
</script>

<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <div v-if="multiple" class="mt-1">
      <select
        multiple
        class="w-full rounded border px-3 py-2"
        :value="modelValue as string[]"
        @change="onMultipleChange"
      >
        <option v-for="o in normalizedOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
      <p class="mt-1 text-xs text-zinc-500">Hold Ctrl/Cmd to select multiple options.</p>
    </div>
    <div v-else class="mt-1 flex gap-2">
      <select
        :value="(modelValue as string) ?? ''"
        class="w-full rounded border px-3 py-2"
        :required="required"
        @change="onSingleChange"
      >
        <option v-if="placeholder || clearable" value="" disabled :selected="!(modelValue as string)">
          {{ placeholder || 'Choose…' }}
        </option>
        <option
          v-for="o in normalizedOptions"
          :key="o.key"
          :value="o.key"
          :disabled="!o.key"
        >
          {{ o.label }}
        </option>
      </select>
      <button
        v-if="clearable && modelValue"
        type="button"
        class="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
        @click="clearSingle"
      >
        Clear
      </button>
    </div>
  </label>
</template>
