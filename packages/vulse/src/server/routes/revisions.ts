import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { RevisionsRepo } from '../../core/repos/revisions.js'
import { defineHandler } from '../handler.js'

export function revisionsRoutes(db: VulseDb, auth: Auth) {
  const repo = new RevisionsRepo(db)
  return {
    list: defineHandler(auth, {
      params: z.object({ collection: z.string(), id: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => await repo.listByEntry(params.id)),

    restore: defineHandler(auth, {
      params: z.object({ collection: z.string(), id: z.string(), version: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params, auth: authCtx }) => {
      if (!authCtx.user) throw new Error('unreachable')
      await repo.restore(params.id, Number(params.version), { userId: authCtx.user.id })
      return { restored: Number(params.version) }
    }),
  }
}
