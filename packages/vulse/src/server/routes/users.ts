import { z } from 'astro/zod'
import { eq } from 'drizzle-orm'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { user as userTable } from '../../core/schema.js'
import { defineHandler } from '../handler.js'
import { NotFoundError } from '../../core/errors.js'

export function usersRoutes(db: VulseDb, auth: Auth) {
  return {
    list: defineHandler(auth, { requireRole: ['admin'] }, async () => {
      return await db.select({
        id: userTable.id, email: userTable.email, name: userTable.name,
        role: userTable.role, displayName: userTable.displayName,
      }).from(userTable)
    }),

    setRole: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      body: z.object({ role: z.enum(['admin', 'editor', 'member']) }),
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      const existing = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, params.id))
      if (!existing.length) throw new NotFoundError(`User ${params.id} not found`)
      await db.update(userTable).set({ role: body.role, updatedAt: new Date() }).where(eq(userTable.id, params.id))
      return { id: params.id, role: body.role }
    }),
  }
}
