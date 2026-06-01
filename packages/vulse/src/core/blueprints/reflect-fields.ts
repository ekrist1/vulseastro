import { z, type ZodTypeAny } from 'zod'

import type { Blueprint } from './types.js'
import type {
  FieldDefinition,
  FieldUi,
  NestedFieldDefinition,
  ReplicatorSetDefinition,
  SelectOption,
} from './definition.js'
import { nestedFieldToDescriptor } from './code-to-definition.js'
import { normalizeSelectOptions } from './select-helpers.js'

export type Widget =
  | 'text'
  | 'textarea'
  | 'number'
  | 'bool'
  | 'date'
  | 'enum'
  | 'ref'
  | 'entry'
  | 'entries'
  | 'link'
  | 'media'
  | 'blocks'
  | 'object'
  | 'repeater'
  | 'grid'
  | 'replicator'

export interface FieldDescriptor {
  path: string
  widget: Widget
  required: boolean
  description?: string
  blocksSets?: string[]
  replicatorSets?: ReplicatorSetDefinition[]
  label?: string
  options?: string[]
  selectOptions?: { key: string; label: string }[]
  selectMultiple?: boolean
  selectPlaceholder?: string
  selectClearable?: boolean
  refTarget?: string
  entryCollections?: string[]
  entriesCollections?: string[]
  entriesMax?: number
  linkCollections?: string[]
  gridMinRows?: number
  gridMaxRows?: number
  gridMode?: 'table' | 'stacked'
  gridAddLabel?: string
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

function effectiveTag(sch: ZodTypeAny): string {
  let current = sch
  for (;;) {
    const tag = (current.description ?? '') as string
    if (tag) return tag
    const def = current._def as ZodDef
    if (def.type === 'optional' || def.type === 'default') {
      current = def.innerType!
      continue
    }
    break
  }
  return ''
}

function maxLength(sch: ZodTypeAny): number | undefined {
  const checks = (sch._def as ZodDef).checks ?? []
  for (const check of checks) {
    const zod = (check as { _zod?: { def?: { check?: string; maximum?: number } } })._zod
    if (zod?.def?.check === 'max_length') return zod.def.maximum
  }
  return undefined
}

function parseEntriesTag(tag: string): { collections: string[]; max?: number } {
  const rest = tag.slice('vulse:entries:'.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon > 0) {
    const maybeMax = Number(rest.slice(lastColon + 1))
    if (!Number.isNaN(maybeMax) && String(maybeMax) === rest.slice(lastColon + 1)) {
      return {
        collections: rest.slice(0, lastColon).split(',').filter(Boolean),
        max: maybeMax,
      }
    }
  }
  return { collections: rest.split(',').filter(Boolean) }
}

export function reflectFields(schema: z.ZodObject<any>): FieldDescriptor[] {
  const shape = schema.shape as Record<string, ZodTypeAny>
  return Object.entries(shape).map(([path, sch]) => describe(path, sch))
}

function describe(path: string, sch: ZodTypeAny): FieldDescriptor {
  const tag = effectiveTag(sch)
  const required = !sch.isOptional()

  if (tag === 'vulse:media') return { path, widget: 'media', required }
  if (tag.startsWith('vulse:ref:')) {
    return { path, widget: 'ref', required, refTarget: tag.slice('vulse:ref:'.length) }
  }
  if (tag.startsWith('vulse:entry:')) {
    return {
      path,
      widget: 'entry',
      required,
      entryCollections: tag.slice('vulse:entry:'.length).split(',').filter(Boolean),
    }
  }
  if (tag.startsWith('vulse:entries:')) {
    const parsed = parseEntriesTag(tag)
    return {
      path,
      widget: 'entries',
      required,
      entriesCollections: parsed.collections,
      ...(parsed.max !== undefined ? { entriesMax: parsed.max } : {}),
    }
  }
  if (tag.startsWith('vulse:link')) {
    const collections =
      tag.length > 'vulse:link'.length
        ? tag.slice('vulse:link:'.length).split(',').filter(Boolean)
        : undefined
    return {
      path,
      widget: 'link',
      required,
      ...(collections !== undefined ? { linkCollections: collections } : {}),
    }
  }

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
    const keys = Object.keys(entries)
    return {
      path,
      widget: 'enum',
      required,
      options: keys,
      selectOptions: keys.map((key) => ({ key, label: key })),
    }
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
      const itemFields = reflectFields(el as z.ZodObject<any>)
      if (tag === 'vulse:grid') {
        return { path, widget: 'grid', required, itemFields, gridMode: 'table' }
      }
      return { path, widget: 'repeater', required, itemFields }
    }
    if ((el._def as ZodDef).type === 'enum') {
      const entries = (el._def as ZodDef).entries ?? {}
      const keys = Object.keys(entries)
      return {
        path,
        widget: 'enum',
        required,
        options: keys,
        selectOptions: keys.map((key) => ({ key, label: key })),
        selectMultiple: true,
      }
    }
    return { path, widget: 'text', required }
  }
  return { path, widget: 'text', required }
}

const RESERVED_FIELD_NAMES = new Set(['slug', 'status', 'seo'])

export function fieldDescriptorsFromDefinitions(fields: FieldDefinition[]): FieldDescriptor[] {
  return fields.map(fieldDefinitionToDescriptor)
}

export function fieldDescriptorsFromBlueprint(bp: Blueprint): FieldDescriptor[] {
  const all = !bp.fields?.length
    ? reflectFields(bp.schema as z.ZodObject<any>)
    : bp.fields.map(fieldDefinitionToDescriptor)
  return all.filter((f) => !RESERVED_FIELD_NAMES.has(f.path))
}

function selectDescriptor(
  base: { path: string; required: boolean; label?: string },
  options: SelectOption[],
  config?: { multiple?: boolean; placeholder?: string; clearable?: boolean },
): FieldDescriptor {
  const normalized = normalizeSelectOptions(options)
  return {
    ...base,
    widget: 'enum',
    options: normalized.map((o) => o.key),
    selectOptions: normalized,
    ...(config?.multiple !== undefined ? { selectMultiple: config.multiple } : {}),
    ...(config?.placeholder !== undefined ? { selectPlaceholder: config.placeholder } : {}),
    ...(config?.clearable !== undefined ? { selectClearable: config.clearable } : {}),
  }
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
      return selectDescriptor(base, f.ui.options, {
        ...(f.ui.multiple !== undefined ? { multiple: f.ui.multiple } : {}),
        ...(f.ui.placeholder !== undefined ? { placeholder: f.ui.placeholder } : {}),
        ...(f.ui.clearable !== undefined ? { clearable: f.ui.clearable } : {}),
      })
    case 'relationship':
      return { ...base, widget: 'ref', refTarget: f.ui.to }
    case 'entry':
      return { ...base, widget: 'entry', entryCollections: f.ui.collections }
    case 'entries':
      return {
        ...base,
        widget: 'entries',
        entriesCollections: f.ui.collections,
        ...(f.ui.max !== undefined ? { entriesMax: f.ui.max } : {}),
      }
    case 'link':
      return {
        ...base,
        widget: 'link',
        ...(f.ui.collections !== undefined ? { linkCollections: f.ui.collections } : {}),
      }
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
    case 'grid':
      return {
        ...base,
        widget: 'grid',
        itemFields: f.ui.fields.map((field) => nestedFieldToDescriptor(field)),
        gridMode: f.ui.mode ?? 'table',
        ...(f.ui.minRows !== undefined ? { gridMinRows: f.ui.minRows } : {}),
        ...(f.ui.maxRows !== undefined ? { gridMaxRows: f.ui.maxRows } : {}),
        ...(f.ui.addLabel !== undefined ? { gridAddLabel: f.ui.addLabel } : {}),
      }
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
