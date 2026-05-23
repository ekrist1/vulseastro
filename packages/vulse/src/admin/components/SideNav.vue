<script setup lang="ts">
defineProps<{
  collections: { name: string; label: string }[]
  activePath?: string
}>()
</script>

<template>
  <nav class="w-60 min-h-screen border-r bg-white p-4 space-y-1 text-sm">
    <div class="text-xl font-semibold mb-6">Vulse</div>
    <a href="/admin" class="block px-3 py-2 rounded hover:bg-zinc-100" :class="activePath === '/admin' && 'bg-zinc-100 font-medium'">Dashboard</a>
    <div class="pt-4 pb-1 text-xs uppercase text-zinc-500">Content</div>
    <a v-for="c in collections" :key="c.name"
       :href="`/admin/collections/${c.name}`"
       class="block px-3 py-2 rounded hover:bg-zinc-100"
       :class="activePath?.startsWith(`/admin/collections/${c.name}`) && 'bg-zinc-100 font-medium'">
      {{ c.label }}
    </a>
    <div class="pt-4 pb-1 text-xs uppercase text-zinc-500">System</div>
    <a href="/admin/media" class="block px-3 py-2 rounded hover:bg-zinc-100">Media</a>
    <a href="/admin/users" class="block px-3 py-2 rounded hover:bg-zinc-100" :class="activePath?.startsWith('/admin/users') && 'bg-zinc-100 font-medium'">Users</a>
    <a href="/admin/settings" class="block px-3 py-2 rounded hover:bg-zinc-100" :class="activePath?.startsWith('/admin/settings') && 'bg-zinc-100 font-medium'">Settings</a>
  </nav>
</template>
