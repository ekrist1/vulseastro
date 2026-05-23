<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>
<template>
  <label class="flex items-center gap-2">
    <input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span class="text-sm text-zinc-600">{{ label }}</span>
  </label>
</template>
