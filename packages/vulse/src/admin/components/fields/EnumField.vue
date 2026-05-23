<script setup lang="ts">
defineProps<{ modelValue: string; label: string; options: string[] }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>
<template>
  <label class="block">
    <span class="text-sm text-zinc-600">{{ label }}</span>
    <select :value="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="mt-1 w-full rounded border px-3 py-2">
      <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
    </select>
  </label>
</template>
