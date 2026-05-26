import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { DEFAULT_LOCALE, EntriesRepo } from '../../core/repos/entries.js'
import { AccessDeniedError, NotFoundError, ValidationError } from '../../core/errors.js'
import { evaluate } from '../../core/access.js'
import { parseContent } from '../../core/parse-content.js'
import { defineHandler } from '../handler.js'
import { isValidLocaleCode, readLocalesConfig } from '../../core/locales.js'

/**
 * The URL slug is owned by the entry locale row. If a user schema also declares a
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

async function resolveLocaleParam(db: VulseDb, raw: string | null | undefined): Promise<string> {
  const cfg = await readLocalesConfig(db)
  if (!raw || raw === DEFAULT_LOCALE) return cfg.defaultLocale
  if (!isValidLocaleCode(raw)) throw new ValidationError(`Invalid locale code: ${raw}`)
  if (!cfg.locales.includes(raw)) {
    throw new ValidationError(`Locale '${raw}' is not enabled for this site.`, {
      field: 'locale',
      supported: cfg.locales,
    })
  }
  return raw
}

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
      const locale = await resolveLocaleParam(db, url.searchParams.get('locale'))
      if (!(await evaluate(bp, 'read', { user: authCtx.user }))) {
        return await entries.list({ collection: params.collection, locale, status: 'published' })
      }
      const parentRaw = url.searchParams.get('parentId')
      const parentId = parentRaw === 'root' || parentRaw === '' ? null : parentRaw ?? undefined
      return await entries.list({
        collection: params.collection,
        locale,
        ...(parentId !== undefined ? { parentId } : {}),
      })
    }),

    tree: defineHandler(auth, {
      params: paramsByCollection,
      requireRole: ['admin', 'editor'],
    }, async ({ params, url }) => {
      const bp = blueprintFor(params.collection)
      if (!bp.tree) throw new ValidationError('Collection does not support tree structure')
      const locale = await resolveLocaleParam(db, url.searchParams.get('locale'))
      return await entries.tree(params.collection, locale)
    }),

    findById: defineHandler(auth, { params: paramsById }, async ({ params, url, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const locale = await resolveLocaleParam(db, url.searchParams.get('locale'))
      const row = await entries.findById(params.id, locale)
      if (!row) throw new NotFoundError(`Entry ${params.id} (${locale}) not found`)
      const allowed = await evaluate(bp, 'read', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new NotFoundError(`Entry ${params.id} not found`)
      return row
    }),

    listLocales: defineHandler(auth, {
      params: paramsById,
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      blueprintFor(params.collection)
      return await entries.listLocales(params.id)
    }),

    create: defineHandler(auth, {
      params: paramsByCollection,
      body: z.object({
        slug: z.string(),
        content: z.unknown(),
        status: z.enum(['draft', 'published']).optional(),
        publish: z.boolean().optional(),
        parentId: z.string().nullable().optional(),
        locale: z.string().optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const allowed = await evaluate(bp, 'create', { user: authCtx.user })
      if (!allowed) throw new AccessDeniedError('Cannot create')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      if (body.parentId && !bp.tree) throw new ValidationError('Collection does not support nesting')
      const locale = await resolveLocaleParam(db, body.locale)
      const validated = parseContent(bp.schema, withCanonicalSlug(body.content, body.slug))
      return await entries.create({
        collection: params.collection,
        slug: body.slug,
        content: validated,
        locale,
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.publish !== undefined ? { publish: body.publish } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        draftsEnabled: bp.drafts === true,
        createdBy: authCtx.user.id,
      })
    }),

    createLocale: defineHandler(auth, {
      params: paramsById,
      body: z.object({
        locale: z.string(),
        slug: z.string(),
        content: z.unknown(),
        status: z.enum(['draft', 'published']).optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const allowed = await evaluate(bp, 'create', { user: authCtx.user })
      if (!allowed) throw new AccessDeniedError('Cannot create')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      const locale = await resolveLocaleParam(db, body.locale)
      const validated = parseContent(bp.schema, withCanonicalSlug(body.content, body.slug))
      return await entries.createLocale(params.id, {
        locale,
        slug: body.slug,
        content: validated,
        updatedBy: authCtx.user.id,
        ...(body.status !== undefined ? { status: body.status } : {}),
        draftsEnabled: bp.drafts === true,
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
        locale: z.string().optional(),
      }),
    }, async ({ params, body, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const locale = await resolveLocaleParam(db, body.locale)
      const row = await entries.findById(params.id, locale)
      if (!row) throw new NotFoundError(`Entry ${params.id} (${locale}) not found`)
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
        locale,
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
      const shell = await entries.findShellById(params.id)
      if (!shell || shell.collection !== params.collection) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'update', {
        user: authCtx.user,
        entry: { id: shell.id, status: 'draft', createdBy: shell.createdBy, content: {} },
      })
      if (!allowed) throw new AccessDeniedError('Cannot move')
      return await entries.move(params.collection, params.id, {
        parentId: body.parentId,
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      })
    }),

    publish: defineHandler(auth, { params: paramsById }, async ({ params, url, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      if (!bp.drafts) throw new ValidationError('Drafts not enabled for this collection')
      const locale = await resolveLocaleParam(db, url.searchParams.get('locale'))
      const row = await entries.findById(params.id, locale)
      if (!row) throw new NotFoundError(`Entry ${params.id} (${locale}) not found`)
      const allowed = await evaluate(bp, 'update', {
        user: authCtx.user,
        entry: { id: row.id, status: row.status, createdBy: row.createdBy, content: row.content },
      })
      if (!allowed) throw new AccessDeniedError('Cannot publish')
      if (!authCtx.user) throw new AccessDeniedError('Authentication required')
      const content = row.draftContent ?? row.content
      const validated = parseContent(bp.schema, content)
      return await entries.updateWithRevision(params.id, {
        locale,
        content: validated,
        publish: true,
        draftsEnabled: true,
        updatedBy: authCtx.user.id,
      })
    }),

    delete: defineHandler(auth, { params: paramsById }, async ({ params, url, auth: authCtx }) => {
      const bp = blueprintFor(params.collection)
      const localeParam = url.searchParams.get('locale')
      const shell = await entries.findShellById(params.id)
      if (!shell || shell.collection !== params.collection) throw new NotFoundError(`Entry ${params.id} not found`)
      const allowed = await evaluate(bp, 'delete', {
        user: authCtx.user,
        entry: { id: shell.id, status: 'draft', createdBy: shell.createdBy, content: {} },
      })
      if (!allowed) throw new AccessDeniedError('Cannot delete')
      if (localeParam) {
        const locale = await resolveLocaleParam(db, localeParam)
        const summaries = await entries.listLocales(params.id)
        if (summaries.length <= 1) {
          await entries.delete(params.id)
          return { deleted: true }
        }
        await entries.deleteLocale(params.id, locale)
        return { deleted: true, locale }
      }
      await entries.delete(params.id)
      return { deleted: true }
    }),
  }
}
