<script setup lang="ts">
defineProps<{ modelValue: string; label: string; required?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}<span v-if="required" class="text-red-600">*</span></span>
    <input :value="modelValue" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      class="mt-1 w-full rounded border px-3 py-2" />
  </label>
</template>
