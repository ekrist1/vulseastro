import { z } from 'zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { SettingsRepo } from '../../core/repos/settings.js'
import { DEFAULT_LOCALE_KEY } from '../../core/locales.js'
import { DEFAULT_LOCALE, EntriesRepo } from '../../core/repos/entries.js'
import { invalidateRuntime } from '../runtime.js'

const AUTH_SETTING_KEYS = new Set(['allowMemberSignUp', 'allowedSignUpDomains'])

export function settingsRoutes(db: VulseDb, auth: Auth) {
  const repo = new SettingsRepo(db)
  return {
    list: defineHandler(auth, { requireRole: ['admin'] }, async () => await repo.all()),
    set: defineHandler(auth, {
      params: z.object({ key: z.string() }),
      body: z.object({ value: z.unknown() }),
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      await repo.set(params.key, body.value)
      if (AUTH_SETTING_KEYS.has(params.key)) invalidateRuntime()
      // Setting a concrete default locale migrates any content still stored under the
      // 'default' sentinel (e.g. created before locales were configured) so it stays
      // editable and publicly resolvable under the new default. Idempotent.
      if (params.key === DEFAULT_LOCALE_KEY && typeof body.value === 'string' && body.value !== DEFAULT_LOCALE) {
        await new EntriesRepo(db).relabelSentinelLocale(body.value)
      }
      return { key: params.key }
    }),
  }
}
