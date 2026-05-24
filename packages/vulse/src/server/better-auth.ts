import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { VulseDb } from '../core/db.js'
import * as schema from '../core/schema.js'
import { SettingsRepo } from '../core/repos/settings.js'
import { runAuthUserAfterCreateHooks, runAuthUserBeforeCreateHooks } from './plugins.js'
import type { AuthUserCreateInput } from '../core/plugins/definition.js'
import { sendEmail, type EmailEnv } from './email.js'

export interface AuthConfig {
  baseURL: string
  secret: string
  /** Override settings row (tests/cron). */
  allowSignUp?: boolean
  env?: Record<string, unknown>
}

function emailDomain(email: string): string | null {
  return email.split('@')[1]?.toLowerCase() ?? null
}

export async function createAuth(db: VulseDb, config: AuthConfig) {
  const settings = new SettingsRepo(db)
  const allowSignUp = config.allowSignUp ?? (await settings.get<boolean>('allowMemberSignUp')) ?? false
  const allowedDomains = (await settings.get<string[]>('allowedSignUpDomains')) ?? []
  const pluginEnv = config.env

  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      disableSignUp: !allowSignUp,
      sendResetPassword: async ({ user, url }) => {
        const emailEnv = pluginEnv as EmailEnv | undefined
        void sendEmail(emailEnv ?? {}, {
          to: user.email,
          subject: 'Reset your password',
          body: `Click the link to reset your password:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        })
      },
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
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = typeof user.email === 'string' ? user.email : ''
            const domain = emailDomain(email)
            if (allowedDomains.length > 0 && (!domain || !allowedDomains.includes(domain))) {
              throw new Error('Email domain not allowed')
            }

            const nextUser = await runAuthUserBeforeCreateHooks({
              user: user as AuthUserCreateInput,
            }, pluginEnv)
            if (nextUser === false) return false
            if (nextUser) return { data: nextUser }
            return undefined
          },
          after: async (user) => {
            await runAuthUserAfterCreateHooks({
              user: user as AuthUserCreateInput,
            }, pluginEnv)
          },
        },
      },
    },
  })
}

export type Auth = Awaited<ReturnType<typeof createAuth>>
