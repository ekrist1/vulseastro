import { betterAuth, type Auth as BetterAuthInstance } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor } from 'better-auth/plugins/two-factor'
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

// Explicit return annotation avoids TS2742: the inferred shape would pull
// internal zod paths (introduced by the two-factor plugin's typed endpoints)
// into the emitted `.d.ts`, which is not portable across pnpm installs. We
// use better-auth's exported base `Auth` type since all call sites use only
// `.handler` and `.api.getSession` / `.api.requestPasswordReset` — none of
// the plugin-specific typed endpoints.
export async function createAuth(db: VulseDb, config: AuthConfig): Promise<BetterAuthInstance> {
  const settings = new SettingsRepo(db)
  const allowSignUp = config.allowSignUp ?? (await settings.get<boolean>('allowMemberSignUp')) ?? false
  const allowedDomains = (await settings.get<string[]>('allowedSignUpDomains')) ?? []
  const pluginEnv = config.env

  const instance = betterAuth({
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
    plugins: [
      // Optional second factor. Users start with `twoFactorEnabled=false` and
      // can opt in from /admin/account; sign-in only challenges users who
      // have explicitly enrolled, so 2FA is never required globally.
      twoFactor({
        issuer: 'Vulse',
      }),
    ],
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
  // Cast to the unparameterised public `Auth` shape. The full inferred type
  // contains plugin endpoints whose body schemas reference zod internals via
  // .pnpm paths; emitting that into our `.d.ts` is not portable. Our server
  // code only uses `.handler`, `.api.getSession`, and `.api.requestPasswordReset`,
  // all of which are present on the base shape.
  return instance as unknown as BetterAuthInstance
}

export type Auth = Awaited<ReturnType<typeof createAuth>>
