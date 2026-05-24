import { BlueprintRegistry } from './registry.js'
import type { Blueprint } from './types.js'
import type { VulseDb } from '../db.js'
import { createDb } from '../db.js'
import { compileBlueprintSchema } from './compile.js'
import { listBlueprintDefinitions } from './mutations.js'
import { seedCodeBlueprints } from './seed.js'
import { loadCompiledSets } from '../sets/service.js'

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

function mergeBlueprint(compiled: Blueprint, code?: Blueprint): Blueprint {
  const preview = code?.preview ?? compiled.preview
  return {
    ...compiled,
    admin: code?.admin ?? compiled.admin,
    ...(code?.access ? { access: code.access } : {}),
    ...(preview ? { preview } : {}),
  }
}

function inferAdmin(def: Blueprint['definition']): Blueprint['admin'] {
  const titleField = def?.fields.find((f) => f.ui.kind === 'text')?.name ?? def?.fields[0]?.name ?? 'id'
  return { titleField, listColumns: [titleField] }
}

export async function registryFromDb(db: VulseDb): Promise<BlueprintRegistry> {
  const codeBlueprints = await loadBlueprintModules()
  await seedCodeBlueprints(db, codeBlueprints)
  const sets = await loadCompiledSets(db)
  const codeByName = new Map(codeBlueprints.map((bp) => [bp.name, bp]))
  const reg = new BlueprintRegistry()

  const definitions = await listBlueprintDefinitions(db)
  for (const def of definitions) {
    const schema = compileBlueprintSchema(def, { sets })
    const code = codeByName.get(def.handle)
    const bp: Blueprint = mergeBlueprint({
      name: def.handle,
      label: def.label,
      schema,
      admin: code?.admin ?? inferAdmin(def),
      singleton: def.singleton,
      fields: def.fields,
      definition: def,
      ...(def.tree !== undefined ? { tree: def.tree } : {}),
      ...(def.maxDepth !== undefined ? { maxDepth: def.maxDepth } : {}),
      ...(def.drafts !== undefined ? { drafts: def.drafts } : {}),
      ...(def.preview ? { preview: def.preview } : {}),
    }, code)
    reg.register(bp)
  }

  for (const code of codeBlueprints) {
    if (!reg.has(code.name)) reg.register(code)
  }

  return reg
}

/** Load registry from D1 when available, otherwise code-only blueprints. */
export async function registryForRequest(db?: VulseDb): Promise<BlueprintRegistry> {
  if (db) {
    return registryFromDb(db)
  }
  if (registryCache) return registryCache
  try {
    const { getRuntimeEnv } = await import('../../server/env.js')
    const env = getRuntimeEnv()
    const conn = createDb(env.DB)
    registryCache = await registryFromDb(conn)
    return registryCache
  } catch {
    return registryFromUserCollections()
  }
}

export async function registryFromUserCollections(db?: VulseDb): Promise<BlueprintRegistry> {
  if (db) return registryFromDb(db)
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
