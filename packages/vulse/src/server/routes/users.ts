import { z } from 'astro/zod'
import { and, eq, like, or } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import { account as accountTable, user as userTable } from '../../core/schema.js'
import { defineHandler } from '../handler.js'
import { NotFoundError } from '../../core/errors.js'

const userFields = {
  id: userTable.id,
  email: userTable.email,
  name: userTable.name,
  role: userTable.role,
  displayName: userTable.displayName,
  emailVerified: userTable.emailVerified,
  createdAt: userTable.createdAt,
  updatedAt: userTable.updatedAt,
}

export function usersRoutes(db: VulseDb, auth: Auth) {
  return {
    list: defineHandler(auth, { requireRole: ['admin'] }, async ({ url }) => {
      const q = url.searchParams.get('q')?.trim()
      if (q) {
        const pattern = `%${q}%`
        return await db.select(userFields).from(userTable).where(or(
          like(userTable.email, pattern),
          like(userTable.name, pattern),
          like(userTable.displayName, pattern),
          eq(userTable.id, q),
        ))
      }
      return await db.select(userFields).from(userTable)
    }),

    get: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      requireRole: ['admin'],
    }, async ({ params }) => {
      const rows = await db.select(userFields).from(userTable).where(eq(userTable.id, params.id))
      if (!rows.length) throw new NotFoundError(`User ${params.id} not found`)
      return rows[0]
    }),

    update: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.string().min(1).optional(),
        displayName: z.string().nullable().optional(),
        role: z.enum(['admin', 'editor', 'member']).optional(),
      }),
      requireRole: ['admin'],
    }, async ({ params, body }) => {
      const existing = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, params.id))
      if (!existing.length) throw new NotFoundError(`User ${params.id} not found`)

      const patch: Partial<typeof userTable.$inferInsert> = { updatedAt: new Date() }
      if (body.name !== undefined) patch.name = body.name
      if (body.displayName !== undefined) patch.displayName = body.displayName
      if (body.role !== undefined) patch.role = body.role

      await db.update(userTable).set(patch).where(eq(userTable.id, params.id))
      const rows = await db.select(userFields).from(userTable).where(eq(userTable.id, params.id))
      return rows[0]
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

    resetPassword: defineHandler(auth, {
      params: z.object({ id: z.string() }),
      body: z.discriminatedUnion('action', [
        z.object({ action: z.literal('email'), redirectTo: z.string().optional() }),
        z.object({ action: z.literal('set'), password: z.string().min(8) }),
      ]),
      requireRole: ['admin'],
    }, async ({ params, body, request }) => {
      const rows = await db.select({ id: userTable.id, email: userTable.email }).from(userTable).where(eq(userTable.id, params.id))
      if (!rows.length) throw new NotFoundError(`User ${params.id} not found`)
      const target = rows[0]!

      if (body.action === 'email') {
        await auth.api.requestPasswordReset({
          body: {
            email: target.email,
            redirectTo: body.redirectTo ?? '/reset-password',
          },
          headers: request.headers,
        })
        return { action: 'email' as const, sent: true }
      }

      const hashedPassword = await hashPassword(body.password)
      const accounts = await db.select({ id: accountTable.id }).from(accountTable).where(and(
        eq(accountTable.userId, params.id),
        eq(accountTable.providerId, 'credential'),
      ))

      const now = new Date()
      if (accounts.length) {
        await db.update(accountTable).set({ password: hashedPassword, updatedAt: now }).where(eq(accountTable.id, accounts[0]!.id))
      } else {
        await db.insert(accountTable).values({
          id: nanoid(),
          userId: params.id,
          accountId: params.id,
          providerId: 'credential',
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        })
      }

      return { action: 'set' as const, updated: true }
    }),
  }
}
