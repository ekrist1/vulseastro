<script setup lang="ts">
defineProps<{ modelValue: string; label: string; required?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <textarea :value="modelValue" @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      rows="6" class="mt-1 w-full rounded border px-3 py-2"></textarea>
  </label>
</template>
