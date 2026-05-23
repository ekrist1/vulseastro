import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { EntriesRepo } from '../../core/repos/entries.js'
import { AccessDeniedError, NotFoundError } from '../../core/errors.js'
import { evaluate } from '../../core/access.js'
import { defineHandler } from '../handler.js'

const paramsByCollection = z.object({ collection: z.string() })
const paramsById = z.object({ collection: z.string(), id: z.string() })

export function entriesRoutes(db: VulseDb, auth: Auth, reg: BlueprintRegistry) {
  const entries = new EntriesRepo(db)

  function blueprintFor(name: string) {
    const bp = reg.get(name)
    if (!bp) throw new NotFoundError(`Unknown collection: ${name}`)
    return bp
  }

  return {
    list: defineHandler(auth, { params: paramsByCollection }, async ({ params, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      if (!(await evaluate(bp, 'read', { user: authCtx.user }))) {
        const rows = await entries.list({ collection: params.collection, status: 'published' })
        return rows
      }
      return await entries.list({ collection: params.collection })
    }),

    findById: defineHandler(auth, { params: paramsById }, async ({ params, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const row = await entries.findById(params.id)
      if (!row) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'read', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new NotFoundError(`Entry ${params.id} not found`)
      return row
    }),

    create: defineHandler(auth, {
      params: paramsByCollection,
      body: z.object({
        slug: z.string(),
        content: z.unknown(),
        status: z.enum(['draft', 'published']).optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const allowed = await evaluate(bp, 'create', { user: authCtx.user })
      if (!allowed) throw new AccessDeniedError('Cannot create')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      const validated = bp.schema.parse(body.content)
      return await entries.create({
        collection: params.collection,
        slug: body.slug,
        content: validated,
        ...(body.status !== undefined ? { status: body.status } : {}),
        createdBy: authCtx.user.id,
      })
    }),

    update: defineHandler(auth, {
      params: paramsById,
      body: z.object({
        slug: z.string().optional(),
        content: z.unknown().optional(),
        status: z.enum(['draft', 'published']).optional(),
        changeSummary: z.string().optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const row = await entries.findById(params.id)
      if (!row) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'update', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new AccessDeniedError('Cannot update')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      const validated = body.content !== undefined ? bp.schema.parse(body.content) : undefined
      return await entries.updateWithRevision(params.id, {
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(validated !== undefined ? { content: validated } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedBy: authCtx.user.id,
        ...(body.changeSummary !== undefined ? { changeSummary: body.changeSummary } : {}),
      })
    }),

    delete: defineHandler(auth, { params: paramsById }, async ({ params, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const row = await entries.findById(params.id)
      if (!row) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'delete', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new AccessDeniedError('Cannot delete')
      await entries.delete(params.id)
      return { deleted: true }
    }),
  }
}
