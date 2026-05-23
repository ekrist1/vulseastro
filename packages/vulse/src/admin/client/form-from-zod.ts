import { z, type ZodTypeAny } from 'astro/zod'

export type Widget = 'text' | 'textarea' | 'number' | 'bool' | 'date' | 'enum' | 'ref' | 'media' | 'blocks' | 'object' | 'repeater'

export interface FieldDescriptor {
  path: string
  widget: Widget
  required: boolean
  description?: string
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
  if (t === 'array') {
    const el = (inner._def as ZodDef).element!
    if ((el._def as ZodDef).type === 'object') {
      return { path, widget: 'repeater', required, itemFields: reflectFields(el as z.ZodObject<any>) }
    }
    if (el.description === 'vulse:blocks' || path === 'body') return { path, widget: 'blocks', required }
    return { path, widget: 'text', required }
  }
  return { path, widget: 'text', required }
}
