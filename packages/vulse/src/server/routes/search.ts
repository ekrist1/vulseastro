import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { defineHandler } from '../handler.js'
import { searchSdk } from '../sdk/search.js'

export function searchRoutes(db: VulseDb, auth: Auth) {
  const sdk = searchSdk(db)
  return {
    query: defineHandler(auth, {
      params: z.object({}),
      body: z.object({
        q: z.string(),
        collections: z.array(z.string()).optional(),
        limit: z.number().optional(),
        includeDrafts: z.boolean().optional(),
      }),
    }, async ({ body }) => sdk.query(body.q, {
      ...(body.collections !== undefined ? { collections: body.collections } : {}),
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
      ...(body.includeDrafts !== undefined ? { includeDrafts: body.includeDrafts } : {}),
    })),
  }
}
