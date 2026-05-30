import { z } from 'astro/zod'
import type { Auth } from '../better-auth.js'
import type { VulseDb } from '../../core/db.js'
import {
  BlueprintDefinitionSchema,
  BlueprintDefinitionWithRenamesSchema,
} from '../../core/blueprints/definition.js'
import {
  createBlueprint,
  deleteBlueprint,
  getBlueprintDefinition,
  listBlueprintDefinitions,
  updateBlueprint,
} from '../../core/blueprints/mutations.js'
import { importBlueprints, SchemaBundleSchema } from '../../core/blueprints/import.js'
import { SCHEMA_TEMPLATES } from '../../core/blueprints/schema-templates.generated.js'
import { _resetRegistry } from '../../core/blueprints/load.js'
import { invalidateRuntime } from '../runtime.js'
import { defineHandler } from '../handler.js'

const paramsHandle = z.object({ handle: z.string() })

export function blueprintsRoutes(db: VulseDb, auth: Auth) {
  return {
    list: defineHandler(auth, {}, async () => listBlueprintDefinitions(db)),

    get: defineHandler(auth, { params: paramsHandle }, async ({ params }) => {
      const def = await getBlueprintDefinition(db, params.handle)
      if (!def) throw new (await import('../../core/errors.js')).NotFoundError('blueprint not found')
      return def
    }),

    create: defineHandler(auth, {
      body: BlueprintDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ body }) => {
      const out = await createBlueprint(db, body)
      _resetRegistry()
      invalidateRuntime()
      return out
    }),

    update: defineHandler(auth, {
      params: paramsHandle,
      body: BlueprintDefinitionWithRenamesSchema,
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      const out = await updateBlueprint(db, params.handle, body)
      _resetRegistry()
      invalidateRuntime()
      return out
    }),

    delete: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin'],
    }, async ({ params }) => {
      await deleteBlueprint(db, params.handle)
      _resetRegistry()
      invalidateRuntime()
      return null
    }),

    listTemplates: defineHandler(auth, {}, async () =>
      SCHEMA_TEMPLATES.map(({ key, name, description, handles }) => ({
        key,
        name,
        description,
        handles,
      })),
    ),

    import: defineHandler(auth, {
      body: SchemaBundleSchema,
      requireRole: ['admin'],
    }, async ({ body }) => {
      const result = await importBlueprints(db, body)
      _resetRegistry()
      invalidateRuntime()
      return result
    }),

    importTemplate: defineHandler(auth, {
      body: z.object({ key: z.string() }),
      requireRole: ['admin'],
    }, async ({ body }) => {
      const template = SCHEMA_TEMPLATES.find((t) => t.key === body.key)
      if (!template) {
        throw new (await import('../../core/errors.js')).NotFoundError(`template not found: ${body.key}`)
      }
      const bundle = SchemaBundleSchema.parse(template.bundle)
      const result = await importBlueprints(db, bundle)
      _resetRegistry()
      invalidateRuntime()
      return result
    }),
  }
}
