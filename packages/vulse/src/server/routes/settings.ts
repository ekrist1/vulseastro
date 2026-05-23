import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { SettingsRepo } from '../../core/repos/settings.js'

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
      return { key: params.key }
    }),
  }
}
