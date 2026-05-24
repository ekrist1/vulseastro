import type { FormDefinition } from '../forms/definition.js'
import type { SubmissionRow } from '../repos/forms.js'
import type { Role } from '../blueprints/types.js'

export type MaybePromise<T> = T | Promise<T>

export interface VulsePluginLogger {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export interface VulsePluginEmail {
  send(input: {
    to: string
    subject: string
    text?: string
    body?: string
    html?: string
  }): Promise<void>
}

export interface VulsePluginContext {
  env: Record<string, unknown>
  logger: VulsePluginLogger
  email: VulsePluginEmail
}

export interface FormBeforeSubmitEvent {
  request: Request
  form: FormDefinition
  payload: Record<string, unknown>
  ip: string
  headers: Headers
}

export type FormBeforeSubmitResult =
  | void
  | {
    action?: 'continue'
    payload?: Record<string, unknown>
  }
  | {
    action: 'drop'
    reason?: string
    response?: 'fake-success'
  }
  | {
    action: 'reject'
    message?: string
  }

export interface FormAfterSubmitEvent {
  request: Request
  form: FormDefinition
  payload: Record<string, unknown>
  submission: SubmissionRow
  ip: string
  headers: Headers
}

export interface FormProcessEvent {
  form: FormDefinition
  payload: Record<string, unknown>
  submission: SubmissionRow
}

export interface AuthUserCreateInput {
  id?: string
  email?: string
  name?: string
  role?: Role
  displayName?: string | null
  [key: string]: unknown
}

export interface AuthUserCreateEvent {
  user: AuthUserCreateInput
}

export type AuthUserBeforeCreateResult =
  | void
  | false
  | {
    action?: 'continue'
    data?: AuthUserCreateInput
  }
  | {
    action: 'reject'
    message?: string
  }

export interface AuthUserCreatedEvent {
  user: AuthUserCreateInput
}

export interface VulsePluginHooks {
  'form:beforeSubmit'?: (
    event: FormBeforeSubmitEvent,
    ctx: VulsePluginContext
  ) => MaybePromise<FormBeforeSubmitResult>
  'form:afterSubmit'?: (
    event: FormAfterSubmitEvent,
    ctx: VulsePluginContext
  ) => MaybePromise<void>
  'form:beforeProcess'?: (
    event: FormProcessEvent,
    ctx: VulsePluginContext
  ) => MaybePromise<void>
  'form:afterProcess'?: (
    event: FormProcessEvent,
    ctx: VulsePluginContext
  ) => MaybePromise<void>
  'auth:userBeforeCreate'?: (
    event: AuthUserCreateEvent,
    ctx: VulsePluginContext
  ) => MaybePromise<AuthUserBeforeCreateResult>
  'auth:userAfterCreate'?: (
    event: AuthUserCreatedEvent,
    ctx: VulsePluginContext
  ) => MaybePromise<void>
}

export type VulseHookName = keyof VulsePluginHooks

export interface VulsePlugin {
  id: string
  version?: string
  /**
   * Higher priority plugins run earlier. Plugins with the same priority run
   * in registration order.
   */
  priority?: number
  capabilities?: string[]
  hooks?: VulsePluginHooks
}

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]*$/

export function assertValidPluginId(id: string): void {
  if (!PLUGIN_ID_RE.test(id)) {
    throw new Error(`Vulse plugin "${id}": id must be lowercase letters, numbers, dots, underscores, or dashes`)
  }
}

export function definePlugin<const T extends VulsePlugin>(plugin: T): T {
  assertValidPluginId(plugin.id)
  return plugin
}
