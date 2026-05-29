<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import CollectionKindIcon from './CollectionKindIcon.vue'

const props = defineProps<{
  collections: { name: string; label: string; singleton?: boolean }[]
  activePath?: string
  userEmail?: string
  isAdmin?: boolean
  status?: { mode: 'development' | 'production'; database: 'local SQLite' | 'remote D1'; warningCount: number }
}>()

const schemaOpen = ref(false)

const SCHEMA_OPEN_KEY = 'vulse.sidebar.schema.open'

onMounted(() => {
  try {
    schemaOpen.value = localStorage.getItem(SCHEMA_OPEN_KEY) === '1'
  } catch {
    // ignore
  }
})

watch(schemaOpen, (v) => {
  try { localStorage.setItem(SCHEMA_OPEN_KEY, v ? '1' : '0') } catch { /* ignore */ }
})

function navClass(href: string) {
  const active = props.activePath === href || (href !== '/admin' && props.activePath?.startsWith(href))
  return ['vulse-nav-link rounded-xl text-sm text-zinc-800', active && 'vulse-nav-link-active'].filter(Boolean)
}

function subNavClass(href: string, exact = false) {
  const active = exact ? props.activePath === href : props.activePath?.startsWith(href)
  return ['block rounded px-2 py-1.5 text-sm hover:bg-zinc-100', active && 'bg-zinc-100 font-medium']
    .filter(Boolean)
    .join(' ')
}

async function signOut() {
  await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  window.location.href = '/admin/login'
}
</script>

<template>
  <aside class="w-[var(--vulse-sidebar-width)] min-h-screen border-r border-zinc-200 bg-white shrink-0">
    <div class="px-4 py-3 font-semibold tracking-tight flex items-center gap-2">
      <svg class="vulse-logo-mark h-8 w-8 shrink-0" width="32" height="32" viewBox="0 0 120 120" role="img" aria-label="Vulse">
        <rect x="0" y="0" width="120" height="120" rx="24" fill="#0B0B0C" />
        <path
          d="M30 36 L60 92 L90 36"
          stroke="#FAFAF7"
          stroke-width="11"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
        <circle cx="60" cy="92" r="6" fill="#FF5B2E" />
      </svg>
      Vulse
    </div>

    <div v-if="status" class="px-4 pb-2">
      <component
        :is="isAdmin ? 'a' : 'span'"
        :href="isAdmin ? '/admin/settings/status' : undefined"
        class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
        :class="status.mode === 'development' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-600'"
      >
        {{ status.mode === 'development' ? 'DEV · local DB' : 'PROD · remote D1' }}
        <span v-if="status.warningCount > 0" :title="`${status.warningCount} warning(s)`">⚠</span>
      </component>
    </div>

    <div v-if="userEmail" class="border-y border-zinc-100 px-4 py-2 text-xs">
      <div class="font-mono text-zinc-700">{{ userEmail }}</div>
      <div class="mt-1 flex items-center gap-3">
        <a href="/admin/account" class="text-zinc-500 hover:text-zinc-900">Account</a>
        <button type="button" class="text-zinc-500 hover:text-zinc-900" @click="signOut">
          Sign out
        </button>
      </div>
    </div>

    <nav class="px-2 pb-6">
      <div class="px-2 pt-2 text-xs uppercase tracking-wide text-zinc-500">Collections</div>
      <a
        v-for="c in collections"
        :key="`coll-${c.name}`"
        :href="`/admin/collections/${c.name}`"
        :class="navClass(`/admin/collections/${c.name}`)"
      >
        <span class="flex items-center gap-2">
          <CollectionKindIcon :singleton="c.singleton" />
          <span>{{ c.label }}</span>
        </span>
      </a>

      <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Forms</div>
      <a href="/admin/forms" :class="navClass('/admin/forms')">
        <span class="flex items-center gap-2">
          <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h12A1.5 1.5 0 0 1 17.5 4v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V4ZM4 4v12h12V4H4Zm2 2h8v1.5H6V6Zm0 3h8v1.5H6V9Zm0 3h5v1.5H6V12Z" />
          </svg>
          <span>Forms</span>
        </span>
      </a>

      <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Media</div>
      <a href="/admin/media" :class="navClass('/admin/media')">
        <span class="flex items-center gap-2">
          <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 0v8.586l2.293-2.293a1 1 0 0 1 1.414 0L11 13.586l2.293-2.293a1 1 0 0 1 1.414 0L15 11.586V5H5Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clip-rule="evenodd" />
          </svg>
          <span>Assets</span>
        </span>
      </a>

      <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Schema</div>
      <button
        type="button"
        class="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
        :aria-expanded="schemaOpen"
        @click="schemaOpen = !schemaOpen"
      >
        <span class="inline-block w-3 text-zinc-400">{{ schemaOpen ? '▾' : '▸' }}</span>
        <span>Collections</span>
      </button>
      <div v-if="schemaOpen" class="ml-4">
        <a
          v-for="c in collections"
          :key="`schema-${c.name}`"
          :href="`/admin/schema/${c.name}`"
          :class="navClass(`/admin/schema/${c.name}`)"
        >
          <span class="flex items-center gap-2">
            <CollectionKindIcon :singleton="c.singleton" />
            <span>{{ c.label }}</span>
          </span>
        </a>
        <a href="/admin/schema/new" :class="navClass('/admin/schema/new')" class="text-zinc-600">
          + New collection
        </a>
      </div>
      <a
        v-if="isAdmin"
        href="/admin/settings/sets"
        :class="subNavClass('/admin/settings/sets')"
      >
        Sets
      </a>
      <a
        v-if="isAdmin"
        href="/admin/settings/globals"
        :class="subNavClass('/admin/settings/globals')"
      >
        Globals
      </a>

      <template v-if="isAdmin">
        <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Users</div>
        <a href="/admin/users" :class="subNavClass('/admin/users')">Users</a>

        <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Settings</div>
        <a href="/admin/settings" :class="subNavClass('/admin/settings', true)">Site</a>
        <a href="/admin/settings/auth" :class="subNavClass('/admin/settings/auth', true)">Auth</a>
        <a href="/admin/settings/redirects" :class="subNavClass('/admin/settings/redirects', true)">Redirects</a>
        <a href="/admin/settings/status" :class="subNavClass('/admin/settings/status', true)">Status</a>
      </template>
    </nav>
  </aside>
</template>
