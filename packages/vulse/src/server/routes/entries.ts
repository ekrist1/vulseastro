import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { EntriesRepo } from '../../core/repos/entries.js'
import { AccessDeniedError, NotFoundError, ValidationError } from '../../core/errors.js'
import { evaluate } from '../../core/access.js'
import { parseContent } from '../../core/parse-content.js'
import { defineHandler } from '../handler.js'

/**
 * The URL slug is owned by the entries table. If a user schema also declares a
 * `slug` field (common for templates), it is hidden from the form; we mirror
 * the canonical slug into content here so schemas that require it still parse.
 */
function withCanonicalSlug(content: unknown, slug: string | undefined): unknown {
  if (slug === undefined) return content
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return content
  return { ...(content as Record<string, unknown>), slug }
}

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
    list: defineHandler(auth, { params: paramsByCollection }, async ({ params, url, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      if (!(await evaluate(bp, 'read', { user: authCtx.user }))) {
        const rows = await entries.list({ collection: params.collection, status: 'published' })
        return rows
      }
      const parentRaw = url.searchParams.get('parentId')
      const parentId = parentRaw === 'root' || parentRaw === '' ? null : parentRaw ?? undefined
      return await entries.list({
        collection: params.collection,
        ...(parentId !== undefined ? { parentId } : {}),
      })
    }),

    tree: defineHandler(auth, { params: paramsByCollection }, async ({ params, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      if (!bp.tree) throw new ValidationError('Collection does not support tree structure')
      if (!(await evaluate(bp, 'read', { user: authCtx.user }))) {
        throw new AccessDeniedError('Cannot read tree')
      }
      return await entries.tree(params.collection)
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
        parentId: z.string().nullable().optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const allowed = await evaluate(bp, 'create', { user: authCtx.user })
      if (!allowed) throw new AccessDeniedError('Cannot create')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      if (body.parentId && !bp.tree) throw new ValidationError('Collection does not support nesting')
      const validated = parseContent(bp.schema, withCanonicalSlug(body.content, body.slug))
      return await entries.create({
        collection: params.collection,
        slug: body.slug,
        content: validated,
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        draftsEnabled: bp.drafts === true,
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
        publish: z.boolean().optional(),
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
      const nextSlug = body.slug ?? row.slug
      const validated = body.content !== undefined
        ? parseContent(bp.schema, withCanonicalSlug(body.content, nextSlug))
        : undefined
      return await entries.updateWithRevision(params.id, {
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(validated !== undefined ? { content: validated } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.publish !== undefined ? { publish: body.publish } : {}),
        draftsEnabled: bp.drafts === true,
        updatedBy: authCtx.user.id,
        ...(body.changeSummary !== undefined ? { changeSummary: body.changeSummary } : {}),
      })
    }),

    move: defineHandler(auth, {
      params: paramsById,
      body: z.object({
        parentId: z.string().nullable(),
        sortOrder: z.number().int().positive().optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      if (!bp.tree) throw new ValidationError('Collection does not support tree structure')
      const row = await entries.findById(params.id)
      if (!row) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'update', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new AccessDeniedError('Cannot move')
      return await entries.move(params.collection, params.id, {
        parentId: body.parentId,
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      })
    }),

    publish: defineHandler(auth, { params: paramsById }, async ({ params, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      if (!bp.drafts) throw new ValidationError('Drafts not enabled for this collection')
      const row = await entries.findById(params.id)
      if (!row) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'update', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new AccessDeniedError('Cannot publish')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      const content = row.draftContent ?? row.content
      const validated = parseContent(bp.schema, content)
      return await entries.updateWithRevision(params.id, {
        content: validated,
        publish: true,
        draftsEnabled: true,
        updatedBy: authCtx.user.id,
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
