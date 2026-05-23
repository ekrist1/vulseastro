<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../client/api'
const users = ref<{ id: string; email: string; name: string; role: string }[]>([])
onMounted(async () => { users.value = await adminApi.get('/api/vulse/users') })
async function setRole(id: string, role: string) {
  await adminApi.post(`/api/vulse/users/${id}/role`, { role })
  users.value = users.value.map((u) => (u.id === id ? { ...u, role } : u))
}
</script>
<template>
  <table class="w-full bg-white border rounded text-sm">
    <thead><tr class="border-b text-left">
      <th class="p-3">Email</th><th class="p-3">Name</th><th class="p-3">Role</th>
    </tr></thead>
    <tbody>
      <tr v-for="u in users" :key="u.id" class="border-b">
        <td class="p-3">{{ u.email }}</td>
        <td class="p-3">{{ u.name }}</td>
        <td class="p-3">
          <select :value="u.role" @change="setRole(u.id, ($event.target as HTMLSelectElement).value)" class="rounded border px-2 py-1">
            <option>admin</option><option>editor</option><option>member</option>
          </select>
        </td>
      </tr>
    </tbody>
  </table>
</template>
