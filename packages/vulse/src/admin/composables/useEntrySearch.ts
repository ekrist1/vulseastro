import { ref, watch } from 'vue'
import { adminApi } from '../client/api.js'

export interface EntryOption {
  id: string
  collection: string
  title?: string
  email?: string
}

export function entryOptionLabel(option: EntryOption): string {
  return option.title ?? option.email ?? option.id
}

export function useEntrySearch(collections: () => string[]) {
  const open = ref(false)
  const query = ref('')
  const options = ref<EntryOption[]>([])
  const loading = ref(false)

  async function loadOptions(search = '') {
    const cols = collections().filter(Boolean)
    if (cols.length === 0) {
      options.value = []
      return
    }

    loading.value = true
    try {
      const needle = search.trim().toLowerCase()
      const merged: EntryOption[] = []

      for (const collection of cols) {
        if (collection === 'user') {
          const users = await adminApi.get<{ id: string; email?: string }[]>(
            `/api/vulse/users?q=${encodeURIComponent(search)}`,
          )
          for (const user of users) {
            merged.push({ id: user.id, collection: 'user', email: user.email })
          }
          continue
        }

        const result = await adminApi.get<
          { items: { id: string; content?: { title?: string }; slug?: string }[] }
        >(`/api/vulse/entries/${collection}`)
        for (const row of result.items) {
          merged.push({
            id: row.id,
            collection,
            title: row.content?.title ?? row.slug ?? row.id,
          })
        }
      }

      options.value = merged.filter((row) => {
        if (!needle) return true
        return entryOptionLabel(row).toLowerCase().includes(needle)
      })
    } finally {
      loading.value = false
    }
  }

  async function resolveLabel(entryId: string, collection: string): Promise<string> {
    if (!entryId) return ''
    if (collection === 'user') {
      const users = await adminApi.get<{ id: string; email?: string }[]>(
        `/api/vulse/users?q=${encodeURIComponent(entryId)}`,
      )
      const match = users.find((user) => user.id === entryId)
      return match ? entryOptionLabel({ id: match.id, collection: 'user', email: match.email }) : entryId
    }

    const row = await adminApi.get<{ id: string; content?: { title?: string }; slug?: string }>(
      `/api/vulse/entries/${collection}/${entryId}`,
    )
    return row.content?.title ?? row.slug ?? row.id
  }

  function openDropdown() {
    open.value = true
    void loadOptions(query.value)
  }

  function closeDropdown() {
    open.value = false
  }

  function onBlur(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && (event.currentTarget as HTMLElement).contains(next)) return
    closeDropdown()
  }

  watch(query, (value) => {
    if (!open.value) return
    void loadOptions(value)
  })

  return {
    open,
    query,
    options,
    loading,
    loadOptions,
    resolveLabel,
    openDropdown,
    closeDropdown,
    onBlur,
  }
}
