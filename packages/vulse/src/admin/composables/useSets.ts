import { onMounted, ref } from 'vue'
import { adminApi } from '../client/api.js'
import type { SetDefinition } from '../../core/sets/definition.js'

let cache: Map<string, SetDefinition> | null = null
let loading: Promise<Map<string, SetDefinition>> | null = null

export async function hydrateSets(): Promise<Map<string, SetDefinition>> {
  if (cache) return cache
  if (!loading) {
    loading = adminApi.get<SetDefinition[]>('/api/vulse/sets').then((list) => {
      cache = new Map(list.map((s) => [s.handle, s]))
      return cache
    })
  }
  return loading
}

export function useSets() {
  const sets = ref<Map<string, SetDefinition>>(cache ?? new Map())

  onMounted(async () => {
    sets.value = await hydrateSets()
  })

  function get(handle: string): SetDefinition | undefined {
    return sets.value.get(handle)
  }

  return { sets, get, hydrate: hydrateSets }
}
