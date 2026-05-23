import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { VulseDb } from '../core/db.js'
import * as schema from '../core/schema.js'
import { SettingsRepo } from '../core/repos/settings.js'

export interface AuthConfig {
  baseURL: string
  secret: string
  /** Override settings row (tests/cron). */
  allowSignUp?: boolean
}

function emailDomain(email: string): string | null {
  return email.split('@')[1]?.toLowerCase() ?? null
}

export async function createAuth(db: VulseDb, config: AuthConfig) {
  const settings = new SettingsRepo(db)
  const allowSignUp = config.allowSignUp ?? (await settings.get<boolean>('allowMemberSignUp')) ?? false
  const allowedDomains = (await settings.get<string[]>('allowedSignUpDomains')) ?? []

  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      disableSignUp: !allowSignUp,
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'member', input: false },
        displayName: { type: 'string', required: false },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    ...(allowedDomains.length > 0 ? {
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              const email = typeof user.email === 'string' ? user.email : ''
              const domain = emailDomain(email)
              if (!domain || !allowedDomains.includes(domain)) {
                throw new Error('Email domain not allowed')
              }
              return { data: user }
            },
          },
        },
      },
    } : {}),
  })
}

export type Auth = Awaited<ReturnType<typeof createAuth>>
