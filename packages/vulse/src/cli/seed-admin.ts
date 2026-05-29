import { nanoid } from 'nanoid'
import { createDb } from '../core/db.js'
import { ConflictError } from '../core/errors.js'
import { createAuth } from '../server/better-auth.js'
import { PLACEHOLDER_AUTH_SECRET } from '../server/placeholder-auth-secret.js'

export interface SeedOptions { email?: string; remote?: boolean; password?: string; config?: string }
export interface SeedResult { email: string; tempPassword: string }

export interface SeedAdminUserOptions {
  email: string
  password?: string
  secret?: string
  baseURL?: string
}

function generatePassword(): string {
  return nanoid(16)
}

/** Creates an admin user with a Better Auth–compatible password hash. */
export async function seedAdminUser(db: D1Database, opts: SeedAdminUserOptions): Promise<SeedResult> {
  const existing = await db.prepare(`SELECT id FROM user WHERE email = ?`).bind(opts.email).first()
  if (existing) throw new ConflictError(`User with email ${opts.email} already exists`)

  const tempPassword = opts.password ?? generatePassword()
  const secret = opts.secret ?? PLACEHOLDER_AUTH_SECRET
  const baseURL = opts.baseURL ?? 'http://localhost'

  const auth = await createAuth(createDb(db), { baseURL, secret, allowSignUp: true })
  const res = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: opts.email, password: tempPassword, name: 'Admin' }),
  }))

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Failed to create admin user (${res.status})${detail ? `: ${detail}` : ''}`)
  }

  await db.prepare(`UPDATE user SET role = 'admin' WHERE email = ?`).bind(opts.email).run()
  return { email: opts.email, tempPassword }
}

export async function runSeedAdmin(opts: SeedOptions): Promise<void> {
  if (!opts.email) {
    process.stderr.write('Error: --email is required.\n')
    process.exit(1)
  }

  const { resolveCliPlatform } = await import('./platform.js')
  const { db, env, dispose } = await resolveCliPlatform({
    ...(opts.remote !== undefined ? { remote: opts.remote } : {}),
    ...(opts.config !== undefined ? { config: opts.config } : {}),
  })
  try {
    const secret = env.BETTER_AUTH_SECRET
    if (typeof secret !== 'string' || !secret) {
      throw new Error('BETTER_AUTH_SECRET missing from wrangler config [vars] (or secrets).')
    }

    const result = await seedAdminUser(db, {
      email: opts.email,
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      secret,
    })

    const scope = opts.remote ? 'remote' : 'local'
    process.stdout.write(`
✅ Admin user created (${scope} D1).

  Email:    ${result.email}
  Password: ${result.tempPassword}

Sign in at /admin/login with these credentials.
`)
  } finally {
    await dispose()
  }
}
