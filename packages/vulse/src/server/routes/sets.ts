import { z } from 'zod'
import type { Auth } from '../better-auth.js'
import type { VulseDb } from '../../core/db.js'
import { SetDefinitionSchema } from '../../core/sets/definition.js'
import { createSet, deleteSet, getSet, listSets, updateSet } from '../../core/sets/service.js'
import { NotFoundError } from '../../core/errors.js'
import { defineHandler } from '../handler.js'

const paramsHandle = z.object({ handle: z.string() })

export function setsRoutes(db: VulseDb, auth: Auth) {
  return {
    list: defineHandler(auth, {}, async () => listSets(db)),

    get: defineHandler(auth, { params: paramsHandle }, async ({ params }) => {
      const row = await getSet(db, params.handle)
      if (!row) throw new NotFoundError('set not found')
      return row
    }),

    create: defineHandler(auth, {
      body: SetDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ body }) => createSet(db, body)),

    update: defineHandler(auth, {
      params: paramsHandle,
      body: SetDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ params, body }) => updateSet(db, params.handle, body)),

    delete: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin'],
    }, async ({ params }) => {
      await deleteSet(db, params.handle)
      return null
    }),
  }
}
