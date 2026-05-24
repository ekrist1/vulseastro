<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSets } from '../../composables/useSets.js'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()

const { sets, hydrate } = useSets()

onMounted(() => {
  void hydrate()
})

const setList = computed(() => [...sets.value.values()])
const selected = computed(() => props.modelValue ?? [])

function toggle(handle: string, checked: boolean) {
  const next = checked
    ? [...selected.value, handle]
    : selected.value.filter((entry) => entry !== handle)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="mt-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-3">
    <span class="block text-xs font-medium text-zinc-700">Global sets</span>
    <p class="mt-1 text-xs text-zinc-500">
      Choose reusable sets from
      <a href="/admin/settings/sets" class="text-zinc-700 underline">Settings → Sets</a>.
      Editors can insert them inside this blocks field.
    </p>
    <div v-if="setList.length === 0" class="mt-2 text-xs text-zinc-500">
      No sets defined yet.
      <a href="/admin/settings/sets/new" class="text-zinc-700 underline">Create one</a>.
    </div>
    <div v-else class="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
      <label
        v-for="set in setList"
        :key="set.handle"
        class="flex items-center gap-2 rounded border border-transparent px-2 py-1.5 text-sm hover:border-zinc-200 hover:bg-white"
      >
        <input
          type="checkbox"
          :value="set.handle"
          :checked="selected.includes(set.handle)"
          @change="toggle(set.handle, ($event.target as HTMLInputElement).checked)"
        />
        <span>
          {{ set.label }}
          <span class="font-mono text-xs text-zinc-500">({{ set.handle }})</span>
        </span>
      </label>
    </div>
    <p v-if="selected.length > 0" class="mt-2 text-xs text-zinc-500">
      {{ selected.length }} set{{ selected.length === 1 ? '' : 's' }} selected.
    </p>
  </div>
</template>
