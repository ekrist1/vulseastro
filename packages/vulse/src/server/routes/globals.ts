import { z } from 'zod'
import type { Auth } from '../better-auth.js'
import type { VulseDb } from '../../core/db.js'
import { GlobalsRepo } from '../../core/repos/globals.js'
import { GlobalSetDefinitionSchema } from '../../core/globals/definition.js'
import { NotFoundError } from '../../core/errors.js'
import { defineHandler } from '../handler.js'

const paramsHandle = z.object({ handle: z.string() })

export function globalsRoutes(db: VulseDb, auth: Auth) {
  const globals = new GlobalsRepo(db)

  return {
    list: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async () => {
      const rows = await globals.listSets()
      return rows.map((row) => ({
        handle: row.handle,
        label: row.label,
        fieldCount: row.definition.fields.length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
    }),

    get: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      const set = await globals.findSetByHandle(params.handle)
      if (!set) throw new NotFoundError('global set not found')
      const value = await globals.getValue(params.handle)
      return {
        set: {
          handle: set.handle,
          label: set.label,
          fields: set.definition.fields,
          createdAt: set.createdAt,
          updatedAt: set.updatedAt,
        },
        value: value ? {
          handle: value.handle,
          content: value.content,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        } : null,
      }
    }),

    create: defineHandler(auth, {
      body: GlobalSetDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ body }) => {
      const row = await globals.createSet(body)
      return {
        handle: row.handle,
        label: row.label,
        fields: row.definition.fields,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    }),

    update: defineHandler(auth, {
      params: paramsHandle,
      body: GlobalSetDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      const row = await globals.updateSet(params.handle, body)
      return {
        handle: row.handle,
        label: row.label,
        fields: row.definition.fields,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    }),

    updateValue: defineHandler(auth, {
      params: paramsHandle,
      body: z.record(z.string(), z.unknown()),
      requireRole: ['admin'],
    }, async ({ params, body }) => globals.updateValue(params.handle, body)),

    delete: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin'],
    }, async ({ params }) => {
      await globals.deleteSet(params.handle)
      return null
    }),
  }
}
