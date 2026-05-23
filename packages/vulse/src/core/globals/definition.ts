import { createHash } from 'node:crypto'
import { z } from 'astro/zod'
import { type FieldDefinition, FieldDefinitionSchema } from '../blueprints/definition.js'

export const GlobalSetDefinitionSchema = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: z.string().min(1),
  fields: z.array(FieldDefinitionSchema).default([]),
})

export type GlobalSetDefinition = z.infer<typeof GlobalSetDefinitionSchema>

export function hashGlobalSetDefinition(def: GlobalSetDefinition): string {
  const canonical = JSON.stringify({
    handle: def.handle,
    label: def.label,
    fields: def.fields.map((f: FieldDefinition) => ({
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
