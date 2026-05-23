import { z } from 'astro/zod'
import type { Auth } from '../better-auth.js'
import type { VulseDb } from '../../core/db.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { defineHandler } from '../handler.js'
import { PreviewSessionsRepo } from '../../core/repos/preview-sessions.js'
import { AccessDeniedError, NotFoundError } from '../../core/errors.js'

function buildPreviewUrl(origin: string, pathTemplate: string, slug: string, token: string): string {
  const path = pathTemplate.replace('{slug}', encodeURIComponent(slug))
  const url = new URL(path, origin)
  url.searchParams.set('vulse_live_preview', token)
  return url.toString()
}

export function previewSessionsRoutes(db: VulseDb, auth: Auth, registry: BlueprintRegistry) {
  const repo = new PreviewSessionsRepo(db)

  return {
    create: defineHandler(auth, {
      requireRole: ['admin', 'editor'],
      body: z.object({
        collection: z.string(),
        entryId: z.string().nullable().optional(),
        slug: z.string(),
        content: z.record(z.string(), z.unknown()),
      }),
    }, async ({ auth: ctx, body, url }) => {
      const bp = registry.get(body.collection)
      if (!bp) throw new NotFoundError(`Collection ${body.collection} not found`)
      const row = await repo.create({
        userId: ctx.user!.id,
        collection: body.collection,
        slug: body.slug,
        content: body.content,
        entryId: body.entryId ?? null,
      })
      const previewPath = bp.preview?.path ?? '/{slug}'
      return {
        id: row.id,
        previewUrl: buildPreviewUrl(url.origin, previewPath, row.slug, row.id),
        expiresAt: row.expiresAt.toISOString(),
      }
    }),

    update: defineHandler(auth, {
      requireRole: ['admin', 'editor'],
      params: z.object({ id: z.string() }),
      body: z.object({
        slug: z.string().optional(),
        content: z.record(z.string(), z.unknown()).optional(),
      }),
    }, async ({ auth: ctx, params, body }) => {
      const patch: { slug?: string; content?: unknown } = {}
      if (body.slug !== undefined) patch.slug = body.slug
      if (body.content !== undefined) patch.content = body.content
      const updated = await repo.update(params.id, ctx.user!.id, patch)
      if (!updated) throw new AccessDeniedError('Session not found or not owned by you')
      return { expiresAt: updated.expiresAt.toISOString() }
    }),

    remove: defineHandler(auth, {
      requireRole: ['admin', 'editor'],
      params: z.object({ id: z.string() }),
    }, async ({ auth: ctx, params }) => {
      const ok = await repo.delete(params.id, ctx.user!.id)
      if (!ok) throw new NotFoundError('Session not found')
      return { ok: true }
    }),
  }
}
