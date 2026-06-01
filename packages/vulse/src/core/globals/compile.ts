import type { z } from 'zod'
import { compileBlueprintSchema } from '../blueprints/compile.js'
import type { CompiledSet } from '../sets/compile.js'
import type { FieldDefinition } from '../blueprints/definition.js'
import { type GlobalSetDefinition, hashGlobalSetDefinition } from './definition.js'

export interface CompiledGlobalSet {
  handle: string
  label: string
  fields: FieldDefinition[]
  schema: z.ZodObject<z.ZodRawShape>
  hash: string
}

export async function compileGlobalSet(
  def: GlobalSetDefinition,
  sets?: Map<string, CompiledSet>,
): Promise<CompiledGlobalSet> {
  const options = sets ? { sets } : {}
  return {
    handle: def.handle,
    label: def.label,
    fields: def.fields,
    schema: compileBlueprintSchema(
      {
        handle: def.handle,
        label: def.label,
        singleton: true,
        fields: def.fields,
      },
      options,
    ),
    hash: await hashGlobalSetDefinition(def),
  }
}
