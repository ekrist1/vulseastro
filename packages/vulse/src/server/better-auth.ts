import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { VulseDb } from '../core/db.js'
import * as schema from '../core/schema.js'

export interface AuthConfig {
  baseURL: string
  secret: string
  allowSignUp?: boolean
}

export function createAuth(db: VulseDb, config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      disableSignUp: !config.allowSignUp,
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
  })
}

export type Auth = ReturnType<typeof createAuth>
