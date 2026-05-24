import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { RevisionsRepo } from '../../core/repos/revisions.js'
import { DEFAULT_LOCALE } from '../../core/repos/entries.js'
import { defineHandler } from '../handler.js'

export function revisionsRoutes(db: VulseDb, auth: Auth) {
  const repo = new RevisionsRepo(db)
  return {
    list: defineHandler(auth, {
      params: z.object({ collection: z.string(), id: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params, url }) => {
      const locale = url.searchParams.get('locale') ?? DEFAULT_LOCALE
      return await repo.listByEntry(params.id, locale)
    }),

    restore: defineHandler(auth, {
      params: z.object({ collection: z.string(), id: z.string(), version: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params, url, auth: authCtx }) => {
      if (!authCtx.user) throw new Error('unreachable')
      const locale = url.searchParams.get('locale') ?? DEFAULT_LOCALE
      await repo.restore(params.id, Number(params.version), { userId: authCtx.user.id, locale })
      return { restored: Number(params.version) }
    }),
  }
}
