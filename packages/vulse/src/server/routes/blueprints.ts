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
import { _resetRegistry } from '../../core/blueprints/load.js'
import { _resetRuntime } from '../runtime.js'
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
      _resetRuntime()
      return out
    }),

    update: defineHandler(auth, {
      params: paramsHandle,
      body: BlueprintDefinitionWithRenamesSchema,
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      const out = await updateBlueprint(db, params.handle, body)
      _resetRegistry()
      _resetRuntime()
      return out
    }),

    delete: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin'],
    }, async ({ params }) => {
      await deleteBlueprint(db, params.handle)
      _resetRegistry()
      _resetRuntime()
      return null
    }),
  }
}
