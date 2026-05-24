import type { VulseDb } from '../../core/db.js'
import { FormsRepo, SubmissionsRepo, FormUploadDraftsRepo } from '../../core/repos/forms.js'
import { compileForm } from '../../core/forms/compile.js'
import { checkRateLimit, hashIp } from '../../core/forms/rate-limit.js'
import { insertUniqueValues } from '../../core/forms/unique.js'
import { NotFoundError, ValidationError } from '../../core/errors.js'
import { fail, ok } from '../envelope.js'
import { enqueueFormProcess } from '../forms/queue.js'
import { runFormAfterSubmitHooks, runFormBeforeSubmitHooks } from '../plugins.js'

export interface FormSubmitRouteOptions {
  queue?: Queue
  env?: Record<string, unknown>
}

export function formSubmitRoutes(db: VulseDb, options: FormSubmitRouteOptions = {}) {
  const forms = new FormsRepo(db)
  const submissions = new SubmissionsRepo(db)
  const drafts = new FormUploadDraftsRepo(db)

  return {
    public: async (request: Request, rawParams: Record<string, string>): Promise<Response> => {
      try {
        const handle = rawParams.handle
        if (!handle) throw new ValidationError('handle required')
        const form = await forms.findByHandle(handle)
        if (!form || !form.enabled) throw new NotFoundError('form not found')

        const def = form.definition
        const honeypot = def.settings.honeypotField ?? '_hp'
        const publicFields = def.fields
          .filter((f) => f.ui.kind !== 'honeypot')
          .map((f) => ({
            name: f.name,
            label: f.label,
            ui: f.ui,
            optional: f.optional,
            validation: f.validation,
          }))

        return ok({
          handle: form.handle,
          label: form.label,
          fields: publicFields,
          successMessage: def.settings.successMessage,
          redirectTo: def.settings.redirectTo,
          honeypotField: honeypot,
        })
      } catch (err) {
        return fail(err)
      }
    },

    submit: async (request: Request, rawParams: Record<string, string>): Promise<Response> => {
      try {
        const handle = rawParams.handle
        if (!handle) throw new ValidationError('handle required')
        const form = await forms.findByHandle(handle)
        if (!form || !form.enabled || !form.definition.settings.enabled) {
          throw new NotFoundError('form not found')
        }

        const def = form.definition
        const honeypot = def.settings.honeypotField ?? '_hp'
        let body = await request.json().catch(() => ({})) as Record<string, unknown>
        const ip = request.headers.get('cf-connecting-ip')
          ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? '0.0.0.0'

        const beforeSubmit = await runFormBeforeSubmitHooks({
          request,
          form: def,
          payload: body,
          ip,
          headers: request.headers,
        }, options.env)
        if (beforeSubmit.action === 'drop') {
          return ok({
            ok: true,
            message: def.settings.successMessage ?? 'Thank you!',
          })
        }
        body = beforeSubmit.payload

        const hp = body[honeypot]
        if (hp !== undefined && hp !== null && String(hp).length > 0) {
          return ok({
            ok: true,
            message: def.settings.successMessage ?? 'Thank you!',
          })
        }

        const rate = def.settings.rateLimit ?? { maxPerIp: 10, windowSec: 3600 }
        const rl = await checkRateLimit(db, handle, hashIp(ip), rate)
        if (!rl.allowed) {
          return new Response(JSON.stringify({
            ok: false,
            error: { code: 'RATE_LIMIT', message: 'Too many submissions' },
          }), {
            status: 429,
            headers: {
              'content-type': 'application/json',
              ...(rl.retryAfterSec ? { 'retry-after': String(rl.retryAfterSec) } : {}),
            },
          })
        }

        const { schema, uniqueFields, inputFields } = compileForm(def)
        const parsed = schema.safeParse(body)
        if (!parsed.success) {
          throw new ValidationError('Invalid submission', { issues: parsed.error.issues })
        }

        const payload = parsed.data as Record<string, unknown>
        const fileRefs: Array<{ field: string; mediaId: string }> = []

        for (const field of inputFields) {
          if (field.ui.kind !== 'file') continue
          const mediaId = payload[field.name]
          if (typeof mediaId !== 'string') continue
          const draft = await drafts.findValid(handle, field.name, mediaId)
          if (!draft) throw new ValidationError(`Invalid or expired file for field "${field.name}"`)
          fileRefs.push({ field: field.name, mediaId })
          await drafts.attachToSubmission(draft.id)
        }

        const submission = await submissions.create({
          formHandle: handle,
          payload,
          fileRefs,
          meta: {
            ip,
            ...(request.headers.get('user-agent') ? { userAgent: request.headers.get('user-agent')! } : {}),
            ...(request.headers.get('referer') ? { referer: request.headers.get('referer')! } : {}),
          },
        })

        try {
          await insertUniqueValues(db, handle, submission.id, payload, uniqueFields)
        } catch (err) {
          await submissions.delete(submission.id)
          throw err
        }

        await enqueueFormProcess(options.queue, submission.id)
        await runFormAfterSubmitHooks({
          request,
          form: def,
          payload,
          submission,
          ip,
          headers: request.headers,
        }, options.env)

        if (def.settings.redirectTo) {
          return ok({ ok: true, redirect: def.settings.redirectTo })
        }
        return ok({
          ok: true,
          message: def.settings.successMessage ?? 'Thank you!',
          submissionId: submission.id,
        })
      } catch (err) {
        return fail(err)
      }
    },
  }
}
