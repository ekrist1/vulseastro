import { createDb } from '../../core/db.js'
import { FormsRepo, SubmissionsRepo } from '../../core/repos/forms.js'
import { renderTemplate } from './templates.js'
import { sendFormEmail } from './email.js'
import { sendFormWebhook } from './webhook.js'
import { getFormHooks } from './hooks.js'
import type { FormProcessMessage } from './queue.js'
import type { FormEmailEnv } from './email.js'

export interface ProcessEnv extends FormEmailEnv {
  DB: D1Database
}

export async function processSubmission(env: ProcessEnv, submissionId: string): Promise<void> {
  const db = createDb(env.DB)
  const forms = new FormsRepo(db)
  const submissions = new SubmissionsRepo(db)
  const submission = await submissions.findById(submissionId)
  if (!submission) return

  const formRow = await forms.findByHandle(submission.formHandle)
  if (!formRow) {
    await submissions.updateStatus(submissionId, 'failed', 'form_not_found')
    return
  }

  const def = formRow.definition
  const ctx = { form: def, submission, payload: submission.payload }
  const hooks = getFormHooks()

  try {
    if (hooks.onSubmit) {
      await hooks.onSubmit({ ...ctx, env: env as unknown as Record<string, unknown> })
    }

    const notifyEmails = def.settings.notifyEmails ?? []
    for (const email of notifyEmails) {
      const body = renderTemplate(
        'New submission for {{form.label}}\n\n{{email}}',
        ctx,
      )
      await sendFormEmail(env, { to: email, subject: `New ${def.label} submission`, body })
    }

    for (const action of def.actions) {
      if (action.type === 'notify') {
        for (const email of action.emails) {
          const body = renderTemplate(action.template ?? 'New submission', ctx)
          await sendFormEmail(env, { to: email, subject: `New ${def.label} submission`, body })
        }
      }
      if (action.type === 'confirmation') {
        const to = submission.payload[action.toField]
        if (to && String(to).length > 0) {
          await sendFormEmail(env, {
            to: String(to),
            subject: renderTemplate(action.subject, ctx),
            body: renderTemplate(action.bodyTemplate, ctx),
          })
        }
      }
      if (action.type === 'webhook') {
        await sendFormWebhook(action.url, { form: def, submission, payload: submission.payload }, action.headers ?? {})
      }
    }

    const conf = def.settings.confirmationEmail
    if (conf?.enabled && conf.toField) {
      const to = submission.payload[conf.toField]
      if (to && String(to).length > 0) {
        await sendFormEmail(env, {
          to: String(to),
          subject: renderTemplate(conf.subject, ctx),
          body: renderTemplate(conf.bodyTemplate, ctx),
        })
      }
    }

    if (hooks.onAfterProcess) {
      await hooks.onAfterProcess({ ...ctx, env: env as unknown as Record<string, unknown> })
    }

    await submissions.updateStatus(submissionId, 'processed')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'process_failed'
    await submissions.updateStatus(submissionId, 'failed', message)
  }
}

export async function vulseFormQueue(
  batch: MessageBatch<FormProcessMessage>,
  env: ProcessEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    if (msg.body.type === 'process_submission') {
      await processSubmission(env, msg.body.submissionId)
    }
    msg.ack()
  }
}
