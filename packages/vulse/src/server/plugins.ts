import { ValidationError } from '../core/errors.js'
import {
  assertValidPluginId,
  type AuthUserBeforeCreateResult,
  type AuthUserCreateEvent,
  type AuthUserCreateInput,
  type AuthUserCreatedEvent,
  type FormAfterSubmitEvent,
  type FormBeforeSubmitEvent,
  type FormBeforeSubmitResult,
  type FormProcessEvent,
  type MaybePromise,
  type VulseHookName,
  type VulsePlugin,
  type VulsePluginContext,
} from '../core/plugins/definition.js'
import { sendFormEmail } from './forms/email.js'
import type { FormEmailEnv } from './forms/email.js'

const DEFAULT_HOOK_TIMEOUT_MS = 5_000

interface RegisteredPlugin {
  plugin: VulsePlugin
  order: number
}

let registeredPlugins: RegisteredPlugin[] = []

function orderedPlugins(): RegisteredPlugin[] {
  return [...registeredPlugins].sort((a, b) => {
    const priority = (b.plugin.priority ?? 0) - (a.plugin.priority ?? 0)
    return priority || a.order - b.order
  })
}

export function setVulsePlugins(plugins: VulsePlugin[] = []): void {
  const seen = new Set<string>()
  registeredPlugins = plugins.map((plugin, order) => {
    assertValidPluginId(plugin.id)
    if (seen.has(plugin.id)) throw new Error(`Vulse plugin "${plugin.id}" is registered more than once`)
    seen.add(plugin.id)
    return { plugin, order }
  })
}

export function getVulsePlugins(): VulsePlugin[] {
  return orderedPlugins().map(({ plugin }) => plugin)
}

export function __testResetVulsePlugins(): void {
  registeredPlugins = []
}

function loggerFor(pluginId: string): VulsePluginContext['logger'] {
  return {
    debug: (message, data) => console.debug(`[vulse:${pluginId}] ${message}`, data ?? ''),
    info: (message, data) => console.info(`[vulse:${pluginId}] ${message}`, data ?? ''),
    warn: (message, data) => console.warn(`[vulse:${pluginId}] ${message}`, data ?? ''),
    error: (message, data) => console.error(`[vulse:${pluginId}] ${message}`, data ?? ''),
  }
}

function pluginContext(pluginId: string, env?: Record<string, unknown>): VulsePluginContext {
  const safeEnv = env ?? {}
  return {
    env: safeEnv,
    logger: loggerFor(pluginId),
    email: {
      send: async (input) => {
        await sendFormEmail(safeEnv as FormEmailEnv, {
          to: input.to,
          subject: input.subject,
          body: input.body ?? input.text ?? input.html ?? '',
        })
      },
    },
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  pluginId: string,
  hookName: VulseHookName,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Vulse plugin "${pluginId}" hook "${hookName}" timed out`))
        }, DEFAULT_HOOK_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function invokeHook<TEvent, TResult>(
  plugin: VulsePlugin,
  hookName: VulseHookName,
  event: TEvent,
  env: Record<string, unknown> | undefined,
): Promise<TResult | undefined> {
  const hook = plugin.hooks?.[hookName] as
    | ((event: TEvent, ctx: VulsePluginContext) => MaybePromise<TResult>)
    | undefined
  if (!hook) return undefined
  return await withTimeout(
    Promise.resolve(hook(event, pluginContext(plugin.id, env))),
    plugin.id,
    hookName,
  )
}

async function runContinueHook<TEvent>(
  hookName: VulseHookName,
  event: TEvent,
  env?: Record<string, unknown>,
): Promise<void> {
  for (const { plugin } of orderedPlugins()) {
    try {
      await invokeHook<TEvent, void>(plugin, hookName, event, env)
    } catch (err) {
      pluginContext(plugin.id, env).logger.error(`Hook "${hookName}" failed`, err)
    }
  }
}

export async function runFormBeforeSubmitHooks(
  event: FormBeforeSubmitEvent,
  env?: Record<string, unknown>,
): Promise<{ action: 'continue'; payload: Record<string, unknown> } | { action: 'drop'; reason?: string }> {
  let payload = event.payload

  for (const { plugin } of orderedPlugins()) {
    const result = await invokeHook<FormBeforeSubmitEvent, FormBeforeSubmitResult>(
      plugin,
      'form:beforeSubmit',
      { ...event, payload },
      env,
    )
    if (!result) continue

    if (result.action === 'drop') {
      return { action: 'drop', ...(result.reason ? { reason: result.reason } : {}) }
    }
    if (result.action === 'reject') {
      throw new ValidationError(result.message ?? `Submission rejected by plugin "${plugin.id}"`, { plugin: plugin.id })
    }
    if (result.payload) payload = result.payload
  }

  return { action: 'continue', payload }
}

export async function runFormAfterSubmitHooks(
  event: FormAfterSubmitEvent,
  env?: Record<string, unknown>,
): Promise<void> {
  await runContinueHook('form:afterSubmit', event, env)
}

export async function runFormBeforeProcessHooks(
  event: FormProcessEvent,
  env?: Record<string, unknown>,
): Promise<void> {
  for (const { plugin } of orderedPlugins()) {
    await invokeHook<FormProcessEvent, void>(plugin, 'form:beforeProcess', event, env)
  }
}

export async function runFormAfterProcessHooks(
  event: FormProcessEvent,
  env?: Record<string, unknown>,
): Promise<void> {
  await runContinueHook('form:afterProcess', event, env)
}

export async function runAuthUserBeforeCreateHooks(
  event: AuthUserCreateEvent,
  env?: Record<string, unknown>,
): Promise<AuthUserCreateInput | false | undefined> {
  let user = event.user
  let changed = false

  for (const { plugin } of orderedPlugins()) {
    const result = await invokeHook<AuthUserCreateEvent, AuthUserBeforeCreateResult>(
      plugin,
      'auth:userBeforeCreate',
      { user },
      env,
    )
    if (result === false) return false
    if (!result) continue
    if (result.action === 'reject') {
      throw new Error(result.message ?? `User rejected by plugin "${plugin.id}"`)
    }
    if (result.data) {
      user = { ...user, ...result.data }
      changed = true
    }
  }

  return changed ? user : undefined
}

export async function runAuthUserAfterCreateHooks(
  event: AuthUserCreatedEvent,
  env?: Record<string, unknown>,
): Promise<void> {
  await runContinueHook('auth:userAfterCreate', event, env)
}
