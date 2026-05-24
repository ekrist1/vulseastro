import { createHash } from 'node:crypto'
import { z } from 'astro/zod'
import type { CompiledSet } from '../sets/compile.js'
import { validateSetNodes } from '../sets/validate-tree.js'
import type {
  BlueprintDefinition,
  FieldDefinition,
  NestedFieldDefinition,
  ReplicatorSetDefinition,
} from './definition.js'
import { LinkValueSchema } from './definition.js'
import { selectOptionKeys } from './select-helpers.js'

export interface CompileBlueprintOptions {
  sets?: Map<string, CompiledSet>
}

export function compileBlueprintSchema(
  def: BlueprintDefinition,
  options: CompileBlueprintOptions = {},
): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of def.fields) {
    shape[f.name] = compileField(f, options.sets)
  }
  return z.object(shape)
}

function compileField(
  f: FieldDefinition,
  sets: Map<string, CompiledSet> | undefined,
): z.ZodTypeAny {
  return compileFieldBase(f, true, sets)
}

function compileFieldBase(
  f: FieldDefinition | NestedFieldDefinition,
  allowMetaFields: boolean,
  sets: Map<string, CompiledSet> | undefined,
): z.ZodTypeAny {
  let s: z.ZodTypeAny = z.never()
  switch (f.ui.kind) {
    case 'text':
    case 'textarea': {
      let str = z.string()
      if (f.validation?.min !== undefined) str = str.min(f.validation.min)
      if (f.validation?.max !== undefined) str = str.max(f.validation.max)
      s = str
      break
    }
    case 'date':
      s = z.coerce.date()
      break
    case 'boolean':
      s = z.boolean()
      break
    case 'select': {
      const keys = selectOptionKeys(f.ui.options)
      const enumSchema = z.enum(keys)
      s = f.ui.multiple ? z.array(enumSchema) : enumSchema
      break
    }
    case 'blocks': {
      const declaredSets = f.ui.sets
      const tag = declaredSets?.length
        ? `vulse:blocks:${declaredSets.join(',')}`
        : 'vulse:blocks'
      if (declaredSets?.length && sets) {
        s = z.any().superRefine((value, refinementCtx) => {
          validateSetNodes(value, [], sets, refinementCtx)
        })
      } else {
        s = z.any()
      }
      s = s.describe(tag)
      break
    }
    case 'relationship':
      s = z.string().describe(`vulse:ref:${f.ui.to}`)
      break
    case 'entry':
      s = z.string().min(1).describe(`vulse:entry:${f.ui.collections.join(',')}`)
      break
    case 'entries': {
      let arr = z.array(z.string().min(1))
      if (f.ui.max !== undefined) arr = arr.max(f.ui.max)
      const tag =
        f.ui.max !== undefined
          ? `vulse:entries:${f.ui.collections.join(',')}:${f.ui.max}`
          : `vulse:entries:${f.ui.collections.join(',')}`
      s = arr.describe(tag)
      break
    }
    case 'link': {
      const tag = f.ui.collections?.length
        ? `vulse:link:${f.ui.collections.join(',')}`
        : 'vulse:link'
      s = LinkValueSchema.describe(tag)
      break
    }
    case 'asset':
      s = z.string().describe('vulse:media')
      break
    case 'replicator':
      if (!allowMetaFields) {
        s = z.never()
        break
      }
      s = compileReplicatorField(f.ui.sets)
      break
    case 'grid':
      if (!allowMetaFields) {
        s = z.never()
        break
      }
      s = compileGridField(f.ui)
      break
  }
  if (f.default !== undefined) s = s.default(f.default)
  if (f.optional) s = s.optional()
  return s
}

function compileReplicatorField(sets: ReplicatorSetDefinition[]): z.ZodTypeAny {
  const schemas = sets.map((set) =>
    z.object({
      set: z.literal(set.name),
      content: compileFieldObject(set.fields),
    }),
  )

  if (schemas.length === 1) return z.array(schemas[0]!)
  const [first, second, ...rest] = schemas
  return z.array(z.discriminatedUnion('set', [first!, second!, ...rest]))
}

function compileGridField(ui: Extract<FieldDefinition['ui'], { kind: 'grid' }>): z.ZodTypeAny {
  let arr = z.array(compileFieldObject(ui.fields))
  if (ui.minRows !== undefined) arr = arr.min(ui.minRows)
  if (ui.maxRows !== undefined) arr = arr.max(ui.maxRows)
  return arr.describe('vulse:grid')
}

export function compileFieldObject(fields: NestedFieldDefinition[]): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    shape[field.name] = compileFieldBase(field, false, undefined)
  }
  return z.object(shape)
}

export function hashDefinition(def: BlueprintDefinition): string {
  const canonical = JSON.stringify({
    handle: def.handle,
    label: def.label,
    singleton: def.singleton,
    tree: def.tree ?? false,
    maxDepth: def.maxDepth ?? null,
    drafts: def.drafts ?? false,
    fields: def.fields.map((f) => ({
      name: f.name,
      label: f.label ?? null,
      ui: f.ui,
      optional: f.optional,
      default: f.default ?? null,
      validation: f.validation ?? null,
    })),
  })
  return createHash('sha256').update(canonical).digest('hex')
}
