import { z } from 'zod'
import type { Auth } from '../better-auth.js'
import type { VulseDb } from '../../core/db.js'
import { FormsRepo, SubmissionsRepo } from '../../core/repos/forms.js'
import { FormDefinitionSchema } from '../../core/forms/definition.js'
import { NotFoundError } from '../../core/errors.js'
import { defineHandler } from '../handler.js'

const paramsHandle = z.object({ handle: z.string() })
const paramsHandleId = z.object({ handle: z.string(), id: z.string() })

export function formsRoutes(db: VulseDb, auth: Auth) {
  const forms = new FormsRepo(db)
  const submissions = new SubmissionsRepo(db)

  return {
    list: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async () => forms.list()),

    create: defineHandler(auth, {
      body: FormDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ body }) => forms.create(body)),

    get: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      const row = await forms.findByHandle(params.handle)
      if (!row) throw new NotFoundError('form not found')
      return row
    }),

    update: defineHandler(auth, {
      params: paramsHandle,
      body: FormDefinitionSchema,
      requireRole: ['admin'],
    }, async ({ params, body }) => forms.update(params.handle, body)),

    delete: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin'],
    }, async ({ params }) => {
      await forms.delete(params.handle)
      return null
    }),

    listSubmissions: defineHandler(auth, {
      params: paramsHandle,
      requireRole: ['admin', 'editor'],
    }, async ({ params, url }) => {
      const limit = Number(url.searchParams.get('limit') ?? '50')
      const offset = Number(url.searchParams.get('offset') ?? '0')
      return submissions.list({
        formHandle: params.handle,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      })
    }),

    getSubmission: defineHandler(auth, {
      params: paramsHandleId,
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      const row = await submissions.findById(params.id)
      if (!row || row.formHandle !== params.handle) throw new NotFoundError('submission not found')
      return row
    }),

    deleteSubmission: defineHandler(auth, {
      params: paramsHandleId,
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      const row = await submissions.findById(params.id)
      if (!row || row.formHandle !== params.handle) throw new NotFoundError('submission not found')
      await submissions.delete(params.id)
      return null
    }),

    bulkDeleteSubmissions: defineHandler(auth, {
      params: paramsHandle,
      body: z.object({ ids: z.array(z.string()).min(1) }),
      requireRole: ['admin', 'editor'],
    }, async ({ params, body }) => {
      const deleted = await submissions.deleteMany(body.ids, params.handle)
      return { deleted }
    }),
  }
}
