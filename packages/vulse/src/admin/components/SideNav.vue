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

function navClass(href: string, exact = false) {
  const active = exact
    ? props.activePath === href
    : props.activePath === href || (href !== '/admin' && props.activePath?.startsWith(href))
  return ['vulse-nav-link rounded-xl text-sm text-zinc-800', active && 'vulse-nav-link-active'].filter(Boolean)
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
      <!-- Collections -->
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

      <!-- Forms -->
      <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Forms</div>
      <a href="/admin/forms" :class="navClass('/admin/forms')">
        <span class="flex items-center gap-2">
          <!-- form/list icon -->
          <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h12A1.5 1.5 0 0 1 17.5 4v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V4ZM4 4v12h12V4H4Zm2 2h8v1.5H6V6Zm0 3h8v1.5H6V9Zm0 3h5v1.5H6V12Z" />
          </svg>
          <span>Forms</span>
        </span>
      </a>

      <!-- Media -->
      <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Media</div>
      <a href="/admin/media" :class="navClass('/admin/media')">
        <span class="flex items-center gap-2">
          <!-- image icon -->
          <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 0v8.586l2.293-2.293a1 1 0 0 1 1.414 0L11 13.586l2.293-2.293a1 1 0 0 1 1.414 0L15 11.586V5H5Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clip-rule="evenodd" />
          </svg>
          <span>Assets</span>
        </span>
      </a>

      <!-- Schema -->
      <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Schema</div>
      <button
        type="button"
        class="vulse-nav-link flex w-full items-center rounded-xl text-left text-sm text-zinc-800"
        :aria-expanded="schemaOpen"
        @click="schemaOpen = !schemaOpen"
      >
        <span class="flex items-center gap-2">
          <!-- chevron toggled as "icon" slot -->
          <svg class="h-4 w-4 shrink-0 text-zinc-500 transition-transform" :class="schemaOpen ? 'rotate-90' : ''" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
          </svg>
          <span>Collections</span>
        </span>
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

      <a v-if="isAdmin" href="/admin/settings/sets" :class="navClass('/admin/settings/sets')">
        <span class="flex items-center gap-2">
          <!-- puzzle/set icon -->
          <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M11 3a1 1 0 1 0-2 0v1H7a2 2 0 0 0-2 2v2H4a1 1 0 1 0 0 2h1v2H4a1 1 0 1 0 0 2h1v1a2 2 0 0 0 2 2h2v-1a1 1 0 1 1 2 0v1h2a2 2 0 0 0 2-2v-1h1a1 1 0 1 0 0-2h-1v-2h1a1 1 0 1 0 0-2h-1V6a2 2 0 0 0-2-2h-2V3Z" />
          </svg>
          <span>Sets</span>
        </span>
      </a>

      <a v-if="isAdmin" href="/admin/settings/globals" :class="navClass('/admin/settings/globals')">
        <span class="flex items-center gap-2">
          <!-- globe icon -->
          <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-.75-4.75a.75.75 0 0 0 1.5 0V8.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L6.2 9.74a.75.75 0 1 0 1.1 1.02l1.95-2.1v4.59Z" clip-rule="evenodd" />
          </svg>
          <span>Globals</span>
        </span>
      </a>

      <!-- Users -->
      <template v-if="isAdmin">
        <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Users</div>
        <a href="/admin/users" :class="navClass('/admin/users')">
          <span class="flex items-center gap-2">
            <!-- users icon -->
            <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 17a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
            </svg>
            <span>Users</span>
          </span>
        </a>

        <!-- Settings -->
        <div class="px-2 pt-4 text-xs uppercase tracking-wide text-zinc-500">Settings</div>
        <a href="/admin/settings" :class="navClass('/admin/settings', true)">
          <span class="flex items-center gap-2">
            <!-- cog icon -->
            <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l1.668 1.667a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v2.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-1.667 1.667a1 1 0 0 1-1.262.125l-1.25-.834a6.953 6.953 0 0 1-1.416.587l-.295 1.473a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.295-1.473a6.957 6.957 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125L1.95 15.332a1 1 0 0 1-.125-1.262l.834-1.25a6.957 6.957 0 0 1-.587-1.416l-1.473-.294A1 1 0 0 1 .795 10.1V7.74a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262L4.617 1.87a1 1 0 0 1 1.262-.125l1.25.834c.445-.245.919-.443 1.416-.587L7.84 1.804ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd" />
            </svg>
            <span>Site</span>
          </span>
        </a>
        <a href="/admin/settings/auth" :class="navClass('/admin/settings/auth', true)">
          <span class="flex items-center gap-2">
            <!-- lock icon -->
            <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clip-rule="evenodd" />
            </svg>
            <span>Auth</span>
          </span>
        </a>
        <a href="/admin/settings/redirects" :class="navClass('/admin/settings/redirects', true)">
          <span class="flex items-center gap-2">
            <!-- arrow-path icon -->
            <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0v2.43l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clip-rule="evenodd" />
            </svg>
            <span>Redirects</span>
          </span>
        </a>
        <a href="/admin/settings/status" :class="navClass('/admin/settings/status', true)">
          <span class="flex items-center gap-2">
            <!-- signal/status icon -->
            <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785L15.98 1.804ZM5.967 4.68a1 1 0 0 0-1.934 0l-.23 1.32a1 1 0 0 1-.767.767l-1.32.23a1 1 0 0 0 0 1.934l1.32.23a1 1 0 0 1 .767.767l.23 1.32a1 1 0 0 0 1.934 0l.23-1.32a1 1 0 0 1 .767-.767l1.32-.23a1 1 0 0 0 0-1.934l-1.32-.23a1 1 0 0 1-.767-.767l-.23-1.32ZM10 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
            </svg>
            <span>Status</span>
          </span>
        </a>
      </template>
    </nav>
  </aside>
</template>
