import { z } from 'astro/zod'
import { NestedFieldDefinitionSchema } from '../blueprints/definition.js'

export const SetDefinitionSchema = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: z.string().min(1),
  fields: z.array(NestedFieldDefinitionSchema).min(1),
})

export type SetDefinition = z.infer<typeof SetDefinitionSchema>
