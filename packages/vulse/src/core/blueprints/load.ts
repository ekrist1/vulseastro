import type { z } from 'astro/zod'
import { BlueprintRegistry } from './registry.js'
import type { Blueprint } from './types.js'
import type { VulseDb } from '../db.js'
import { createDb } from '../db.js'
import { compileBlueprintSchema } from './compile.js'
import { listBlueprintDefinitions } from './mutations.js'
import { seedCodeBlueprints } from './seed.js'
import { loadCompiledSets } from '../sets/service.js'
import { toPreviewConfig } from './preview-path.js'
import { applySeoToSchema, type SeoFieldMapping } from './seo.js'

let registryCache: BlueprintRegistry | null = null
let seededBlueprints: Blueprint[] | null = null

async function loadBlueprintModules(projectRoot?: string): Promise<Blueprint[]> {
  if (seededBlueprints) return seededBlueprints
  try {
    const mod = await import('virtual:vulse-blueprints')
    return mod.default as Blueprint[]
  } catch {
    if (projectRoot) {
      const { loadCodeBlueprintsFromDisk } = await import('./load-from-disk.js')
      return loadCodeBlueprintsFromDisk(projectRoot)
    }
    return []
  }
}

function finalizeBlueprint(bp: Blueprint): Blueprint {
  const seo = bp.seo === true
  if (!seo) return bp
  return {
    ...bp,
    seo: true,
    schema: applySeoToSchema(bp.schema as z.ZodObject<z.ZodRawShape>),
  }
}

function normalizeSeoMapping(
  mapping: Partial<Record<keyof SeoFieldMapping, string | undefined>> | undefined,
): SeoFieldMapping | undefined {
  if (!mapping) return undefined
  const out: SeoFieldMapping = {}
  if (mapping.metaTitle !== undefined) out.metaTitle = mapping.metaTitle
  if (mapping.metaDescription !== undefined) out.metaDescription = mapping.metaDescription
  if (mapping.ogImage !== undefined) out.ogImage = mapping.ogImage
  return Object.keys(out).length ? out : undefined
}

function mergeAdmin(compiled: Blueprint, code?: Blueprint): Blueprint['admin'] {
  const admin = code?.admin ?? compiled.admin
  const seoMapping = normalizeSeoMapping(code?.admin?.seoMapping ?? compiled.definition?.seoMapping)
  if (!seoMapping) return admin
  return { ...admin, seoMapping }
}

function mergeBlueprint(compiled: Blueprint, code?: Blueprint): Blueprint {
  const rawPreview = code?.preview ?? compiled.preview
  const preview = rawPreview ? toPreviewConfig(rawPreview) : undefined
  const seo = code?.seo ?? compiled.seo
  return finalizeBlueprint({
    ...compiled,
    admin: mergeAdmin(compiled, code),
    ...(code?.access ? { access: code.access } : {}),
    ...(preview ? { preview } : {}),
    ...(seo ? { seo: true } : {}),
  })
}

function inferAdmin(def: Blueprint['definition']): Blueprint['admin'] {
  const titleField = def?.fields.find((f) => f.ui.kind === 'text')?.name ?? def?.fields[0]?.name ?? 'id'
  return { titleField, listColumns: [titleField] }
}

export async function registryFromDb(db: VulseDb, projectRoot?: string): Promise<BlueprintRegistry> {
  const codeBlueprints = await loadBlueprintModules(projectRoot)
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
      ...(def.seo !== undefined ? { seo: def.seo } : {}),
      ...(def.preview ? { preview: toPreviewConfig(def.preview) } : {}),
    }, code)
    reg.register(bp)
  }

  for (const code of codeBlueprints) {
    if (!reg.has(code.name)) reg.register(finalizeBlueprint(code))
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
    reg.register(finalizeBlueprint(bp))
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
