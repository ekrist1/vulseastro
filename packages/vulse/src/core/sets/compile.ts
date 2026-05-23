import type { z } from 'astro/zod'
import { compileFieldObject } from '../blueprints/compile.js'
import type { SetDefinition } from './definition.js'

export interface CompiledSet {
  definition: SetDefinition
  schema: z.ZodObject<z.ZodRawShape>
}

export function compileSet(def: SetDefinition): CompiledSet {
  return { definition: def, schema: compileFieldObject(def.fields) }
}
