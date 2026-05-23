import { z } from 'astro/zod'
import type { FormDefinition, FormFieldDefinition } from './definition.js'

export interface CompiledForm {
  schema: z.ZodObject<z.ZodRawShape>
  inputFields: FormFieldDefinition[]
  uniqueFields: string[]
}

const LAYOUT_KINDS = new Set(['submit', 'honeypot'])

export function compileForm(def: FormDefinition): CompiledForm {
  const inputFields = def.fields.filter((f) => !LAYOUT_KINDS.has(f.ui.kind))
  const uniqueFields = inputFields
    .filter((f) => f.validation?.unique)
    .map((f) => f.name)

  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of inputFields) {
    shape[field.name] = compileFormField(field)
  }

  return {
    schema: z.object(shape),
    inputFields,
    uniqueFields,
  }
}

function compileFormField(f: FormFieldDefinition): z.ZodTypeAny {
  let s: z.ZodTypeAny = z.never()
  const v = f.validation

  switch (f.ui.kind) {
    case 'text':
    case 'textarea': {
      let str = z.string()
      if (v?.min !== undefined) str = str.min(v.min)
      if (v?.max !== undefined) str = str.max(v.max)
      if (v?.pattern) str = str.regex(new RegExp(v.pattern))
      if (v?.url) str = str.url()
      s = str
      break
    }
    case 'email': {
      let str = z.string().email()
      if (v?.min !== undefined) str = str.min(v.min)
      if (v?.max !== undefined) str = str.max(v.max)
      s = str
      break
    }
    case 'number': {
      let num = v?.integer ? z.coerce.number().int() : z.coerce.number()
      if (v?.min !== undefined) num = num.min(v.min)
      if (v?.max !== undefined) num = num.max(v.max)
      s = num
      break
    }
    case 'date':
    case 'time':
    case 'datetime':
      s = z.string()
      break
    case 'select':
    case 'radio':
      s = z.enum(f.ui.options as [string, ...string[]])
      break
    case 'checkbox':
      s = z.boolean()
      break
    case 'file':
      s = z.string().min(1)
      break
    case 'hidden':
      s = z.string()
      break
  }

  if (f.default !== undefined) s = s.default(f.default)
  if (f.optional && !v?.required) s = s.optional()
  else if (v?.required) s = s.refine((val) => val !== '' && val !== undefined && val !== null, { message: 'Required' })

  return s
}
