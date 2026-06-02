import { z } from 'zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { RedirectsRepo, normalizePath } from '../../core/repos/redirects.js'
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js'

const fromPathSchema = z.string().min(1).max(2048)
  .refine((v) => v.startsWith('/'), { message: 'from path must start with /' })

const toUrlSchema = z.string().min(1).max(2048)
  .refine((v) => v.startsWith('/') || /^https?:\/\//i.test(v), {
    message: 'to url must be a site-relative path (/foo) or absolute URL (https://…)',
  })

// Reject obvious self-redirects (`/foo` → `/foo`) that would loop in the
// browser. Only checks site-relative targets — absolute URLs can't be
// classified as same-site without knowing the configured host.
function assertNotSelfLoop(fromPath: string, toUrl: string): void {
  if (!toUrl.startsWith('/')) return
  const normalizedFrom = normalizePath(fromPath)
  const targetPath = normalizePath(toUrl.split('?')[0]!.split('#')[0]!)
  if (normalizedFrom === targetPath) {
    throw new ValidationError('Redirect target must differ from the source path', {
      fromPath: normalizedFrom,
      toUrl,
    })
  }
}

export function redirectsRoutes(db: VulseDb, auth: Auth) {
  const repo = new RedirectsRepo(db)
  return {
    list: defineHandler(auth, { requireRole: ['admin'] }, async () => await repo.list()),

    get: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      requireRole: ['admin'],
    }, async ({ params }) => {
      const row = await repo.findById(params.id)
      if (!row) throw new NotFoundError(`Redirect ${params.id} not found`)
      return row
    }),

    create: defineHandler(auth, {
      body: z.object({
        fromPath: fromPathSchema,
        toUrl: toUrlSchema,
        status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
        enabled: z.boolean().optional(),
      }),
      requireRole: ['admin'],
    }, async ({ body, auth: authCtx }) => {
      assertNotSelfLoop(body.fromPath, body.toUrl)
      const existing = await repo.findByPath(body.fromPath)
      if (existing) throw new ConflictError(`Redirect for ${normalizePath(body.fromPath)} already exists`)
      return await repo.create({
        fromPath: body.fromPath,
        toUrl: body.toUrl,
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        createdBy: authCtx.user?.id ?? null,
      })
    }),

    update: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      body: z.object({
        fromPath: fromPathSchema.optional(),
        toUrl: toUrlSchema.optional(),
        status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
        enabled: z.boolean().optional(),
      }),
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      const current = await repo.findById(params.id)
      if (!current) throw new NotFoundError(`Redirect ${params.id} not found`)
      if (body.fromPath !== undefined) {
        const normalized = normalizePath(body.fromPath)
        if (normalized !== current.fromPath) {
          const clash = await repo.findByPath(normalized)
          if (clash) throw new ConflictError(`Redirect for ${normalized} already exists`)
        }
      }
      assertNotSelfLoop(body.fromPath ?? current.fromPath, body.toUrl ?? current.toUrl)
      const patch: Parameters<typeof repo.update>[1] = {}
      if (body.fromPath !== undefined) patch.fromPath = body.fromPath
      if (body.toUrl !== undefined) patch.toUrl = body.toUrl
      if (body.status !== undefined) patch.status = body.status
      if (body.enabled !== undefined) patch.enabled = body.enabled
      const next = await repo.update(params.id, patch)
      if (!next) throw new NotFoundError(`Redirect ${params.id} not found`)
      return next
    }),

    delete: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      requireRole: ['admin'],
    }, async ({ params }) => {
      const current = await repo.findById(params.id)
      if (!current) throw new NotFoundError(`Redirect ${params.id} not found`)
      await repo.delete(params.id)
      return { id: params.id, deleted: true }
    }),
  }
}
