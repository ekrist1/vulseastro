import { nanoid } from 'nanoid'
import { ConflictError } from '../core/errors.js'

export interface SeedOptions { email?: string; remote?: boolean }
export interface SeedResult { email: string; tempPassword: string }

function generatePassword(): string {
  return nanoid(16)
}

export async function seedAdminUser(db: D1Database, opts: { email: string }): Promise<SeedResult> {
  const existing = await db.prepare(`SELECT id FROM user WHERE email = ?`).bind(opts.email).first()
  if (existing) throw new ConflictError(`User with email ${opts.email} already exists`)

  const id = nanoid()
  const tempPassword = generatePassword()
  const now = Date.now()
  await db.batch([
    db.prepare(`INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at)
                 VALUES (?, ?, ?, 1, 'admin', ?, ?)`).bind(id, 'Admin', opts.email, now, now),
    db.prepare(`INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
                 VALUES (?, ?, ?, 'credential', ?, ?, ?)`).bind(nanoid(), id, opts.email, `seed:${tempPassword}`, now, now),
  ])
  return { email: opts.email, tempPassword }
}

export async function runSeedAdmin(opts: SeedOptions): Promise<void> {
  if (!opts.email) {
    process.stderr.write('Error: --email is required for non-interactive seed. (Interactive mode comes in v1.1.)\n')
    process.exit(1)
  }
  console.log('Seed via API: a follow-up plan wires this to wrangler exec. For now, run integration tests.')
}
