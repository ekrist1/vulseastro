import type { FormDefinition } from '../../core/forms/definition.js'
import type { SubmissionRow } from '../../core/repos/forms.js'

export interface FormHookContext {
  form: FormDefinition
  payload: Record<string, unknown>
  submission: SubmissionRow
  env: Record<string, unknown>
  request?: Request
}

export type FormHook = (ctx: FormHookContext) => Promise<void>

let onSubmitHook: FormHook | undefined
let onAfterProcessHook: FormHook | undefined

export function setFormHooks(hooks: { onSubmit?: FormHook; onAfterProcess?: FormHook }): void {
  onSubmitHook = hooks.onSubmit
  onAfterProcessHook = hooks.onAfterProcess
}

export function getFormHooks(): { onSubmit?: FormHook; onAfterProcess?: FormHook } {
  const hooks: { onSubmit?: FormHook; onAfterProcess?: FormHook } = {}
  if (onSubmitHook) hooks.onSubmit = onSubmitHook
  if (onAfterProcessHook) hooks.onAfterProcess = onAfterProcessHook
  return hooks
}

export function __testResetFormHooks(): void {
  onSubmitHook = undefined
  onAfterProcessHook = undefined
}
