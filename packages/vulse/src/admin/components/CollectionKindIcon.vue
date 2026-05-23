<script setup lang="ts">
defineProps<{ singleton?: boolean; class?: string }>()
</script>

<template>
  <svg
    class="h-4 w-4 shrink-0 text-zinc-500"
    :class="$props.class"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      v-if="singleton"
      fill-rule="evenodd"
      d="M10 2a1 1 0 0 1 1 1v1.323l3.954 1.582 1.599-.8a1 1 0 0 1 .894 1.79l-1.233.616 1.738 5.42A1 1 0 0 1 17 13H3a1 1 0 0 1-.948-1.316l1.738-5.42-1.233-.617a1 1 0 0 1 .894-1.788l1.599.799L9 4.323V3a1 1 0 0 1 1-1Z"
      clip-rule="evenodd"
    />
    <path
      v-else
      fill-rule="evenodd"
      d="M2 4.75A2.75 2.75 0 0 1 4.75 2h10.5A2.75 2.75 0 0 1 18 4.75v10.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25V4.75ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25H4.75Z"
      clip-rule="evenodd"
    />
  </svg>
</template>
