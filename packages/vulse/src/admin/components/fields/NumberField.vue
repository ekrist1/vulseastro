<script setup lang="ts">
defineProps<{ modelValue: number | null | undefined; label: string; required?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: number | null): void }>()
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}<span v-if="required" class="text-red-600">*</span></span>
    <input type="number" :value="modelValue ?? ''"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value))"
      class="mt-1 w-full rounded border px-3 py-2" />
  </label>
</template>
