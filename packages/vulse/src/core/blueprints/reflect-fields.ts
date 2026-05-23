import { z, type ZodTypeAny } from 'astro/zod'

import type { Blueprint } from './types.js'
import type {
  FieldDefinition,
  FieldUi,
  NestedFieldDefinition,
  ReplicatorSetDefinition,
} from './definition.js'
import { nestedFieldToDescriptor } from './code-to-definition.js'

export type Widget = 'text' | 'textarea' | 'number' | 'bool' | 'date' | 'enum' | 'ref' | 'media' | 'blocks' | 'object' | 'repeater' | 'replicator'

export interface FieldDescriptor {
  path: string
  widget: Widget
  required: boolean
  description?: string
  blocksSets?: string[]
  replicatorSets?: ReplicatorSetDefinition[]
  label?: string
  options?: string[]
  refTarget?: string
  children?: FieldDescriptor[]
  itemFields?: FieldDescriptor[]
}

interface ZodDef {
  type: string
  innerType?: ZodTypeAny
  element?: ZodTypeAny
  shape?: Record<string, ZodTypeAny>
  entries?: Record<string, string>
  checks?: unknown[]
}

function unwrap(sch: ZodTypeAny): ZodTypeAny {
  let inner = sch
  for (;;) {
    const def = inner._def as ZodDef
    if (def.type === 'optional' || def.type === 'default') {
      inner = def.innerType!
      continue
    }
    break
  }
  return inner
}

function maxLength(sch: ZodTypeAny): number | undefined {
  const checks = (sch._def as ZodDef).checks ?? []
  for (const check of checks) {
    const zod = (check as { _zod?: { def?: { check?: string; maximum?: number } } })._zod
    if (zod?.def?.check === 'max_length') return zod.def.maximum
  }
  return undefined
}

export function reflectFields(schema: z.ZodObject<any>): FieldDescriptor[] {
  const shape = schema.shape as Record<string, ZodTypeAny>
  return Object.entries(shape).map(([path, sch]) => describe(path, sch))
}

function describe(path: string, sch: ZodTypeAny): FieldDescriptor {
  const tag = (sch.description ?? '') as string
  const required = !sch.isOptional()

  if (tag === 'vulse:media') return { path, widget: 'media', required }
  if (tag.startsWith('vulse:ref:')) return { path, widget: 'ref', required, refTarget: tag.slice('vulse:ref:'.length) }

  const inner = unwrap(sch)
  const t = (inner._def as ZodDef).type

  if (t === 'string') {
    const max = maxLength(inner)
    return { path, widget: max && max > 200 ? 'textarea' : 'text', required }
  }
  if (t === 'number') return { path, widget: 'number', required }
  if (t === 'boolean') return { path, widget: 'bool', required }
  if (t === 'date') return { path, widget: 'date', required }
  if (t === 'enum') {
    const entries = (inner._def as ZodDef).entries ?? {}
    return { path, widget: 'enum', required, options: Object.keys(entries) }
  }
  if (t === 'object') {
    return { path, widget: 'object', required, children: reflectFields(inner as z.ZodObject<any>) }
  }
  if (t === 'any' && (tag === 'vulse:blocks' || tag.startsWith('vulse:blocks:'))) {
    return blocksDescriptor(path, required, tag)
  }
  if (t === 'array') {
    if (tag === 'vulse:blocks' || tag.startsWith('vulse:blocks:') || path === 'body') {
      return blocksDescriptor(path, required, tag || 'vulse:blocks')
    }
    const el = (inner._def as ZodDef).element!
    if ((el._def as ZodDef).type === 'object') {
      return { path, widget: 'repeater', required, itemFields: reflectFields(el as z.ZodObject<any>) }
    }
    return { path, widget: 'text', required }
  }
  return { path, widget: 'text', required }
}

// Names that the entries table owns directly; if user schemas declare them,
// they are managed by the form's dedicated UI (URL slug input, status select)
// and must not render as duplicate fields.
const RESERVED_FIELD_NAMES = new Set(['slug', 'status'])

export function fieldDescriptorsFromBlueprint(bp: Blueprint): FieldDescriptor[] {
  const all = !bp.fields?.length
    ? reflectFields(bp.schema as z.ZodObject<any>)
    : bp.fields.map(fieldDefinitionToDescriptor)
  return all.filter((f) => !RESERVED_FIELD_NAMES.has(f.path))
}

function fieldDefinitionToDescriptor(f: FieldDefinition): FieldDescriptor {
  const base = { path: f.name, required: !f.optional, label: f.label ?? f.name }
  switch (f.ui.kind) {
    case 'textarea':
      return { ...base, widget: 'textarea' }
    case 'boolean':
      return { ...base, widget: 'bool' }
    case 'date':
      return { ...base, widget: 'date' }
    case 'select':
      return { ...base, widget: 'enum', options: f.ui.options }
    case 'relationship':
      return { ...base, widget: 'ref', refTarget: f.ui.to }
    case 'asset':
      return { ...base, widget: 'media' }
    case 'blocks': {
      const tag = f.ui.sets?.length ? `vulse:blocks:${f.ui.sets.join(',')}` : 'vulse:blocks'
      return {
        ...base,
        widget: 'blocks',
        description: tag,
        ...(f.ui.sets?.length ? { blocksSets: f.ui.sets } : {}),
      }
    }
    case 'replicator':
      return { ...base, widget: 'replicator', replicatorSets: f.ui.sets }
    default:
      return { ...base, widget: 'text' }
  }
}

function blocksDescriptor(path: string, required: boolean, tag: string): FieldDescriptor {
  const blocksSets = tag.startsWith('vulse:blocks:')
    ? tag.slice('vulse:blocks:'.length).split(',').filter(Boolean)
    : []
  return {
    path,
    widget: 'blocks',
    required,
    description: tag,
    ...(blocksSets.length ? { blocksSets } : {}),
  }
}
