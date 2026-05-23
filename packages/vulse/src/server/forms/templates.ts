import type { FormDefinition } from '../../core/forms/definition.js'
import type { SubmissionRow } from '../../core/repos/forms.js'

export interface TemplateContext {
  form: FormDefinition
  submission: SubmissionRow
  payload: Record<string, unknown>
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  const tokens: Record<string, string> = {
    'form.label': ctx.form.label,
    'submission.id': ctx.submission.id,
    'submission.created_at': ctx.submission.createdAt.toISOString(),
  }
  for (const [key, value] of Object.entries(ctx.payload)) {
    tokens[key] = value === null || value === undefined ? '' : String(value)
  }

  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim()
    return tokens[trimmed] ?? ''
  })
}
