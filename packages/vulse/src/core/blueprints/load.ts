import { BlueprintRegistry } from './registry.js'
import type { Blueprint } from './types.js'

let registryCache: BlueprintRegistry | null = null
let seededBlueprints: Blueprint[] | null = null

async function loadBlueprintModules(): Promise<Blueprint[]> {
  if (seededBlueprints) return seededBlueprints
  try {
    const mod = await import('virtual:vulse-blueprints')
    return mod.default as Blueprint[]
  } catch {
    return []
  }
}

export async function registryFromUserCollections(): Promise<BlueprintRegistry> {
  if (registryCache) return registryCache
  const reg = new BlueprintRegistry()
  for (const bp of await loadBlueprintModules()) {
    reg.register(bp)
  }
  registryCache = reg
  return reg
}

/** For tests: bypass blueprint loading with explicit blueprints. */
export function _seedRegistry(blueprints: Blueprint[]): void {
  seededBlueprints = blueprints
  registryCache = null
}

export function _resetRegistry(): void {
  registryCache = null
  seededBlueprints = null
}
