import { z } from 'astro/zod'
import { sha256Hex } from '../sha256.js'
import { type FieldDefinition, FieldDefinitionSchema } from '../blueprints/definition.js'

export const GlobalSetDefinitionSchema = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: z.string().min(1),
  fields: z.array(FieldDefinitionSchema).default([]),
})

export type GlobalSetDefinition = z.infer<typeof GlobalSetDefinitionSchema>

export async function hashGlobalSetDefinition(def: GlobalSetDefinition): Promise<string> {
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
  return sha256Hex(canonical)
}
