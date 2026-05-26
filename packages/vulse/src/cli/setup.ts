import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { patchWranglerConfig, findWranglerConfig } from '../integration/wrangler-config.js'
import { runMigrate } from './migrate.js'
import { runSeedAdmin } from './seed-admin.js'
import { PLACEHOLDER_AUTH_SECRET } from '../placeholder-auth-secret.js'

export interface SetupOptions {
  yes?: boolean
  email?: string
  password?: string
  skipMigrate?: boolean
  skipSeed?: boolean
  cwd?: string
}

const DEV_VARS_FILE = '.dev.vars'
const WRANGLER_FILE = 'wrangler.toml'
const GITIGNORE_FILE = '.gitignore'

const PLACEHOLDER_DB_ID = 'TODO_PASTE_ID_FROM_WRANGLER_OUTPUT'

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

async function readIfExists(path: string): Promise<string> {
  return (await fileExists(path)) ? readFile(path, 'utf8') : ''
}

/** 32 random bytes → 64-char hex string. Suitable for BETTER_AUTH_SECRET. */
export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Set the D1 `database_id` in wrangler.toml. Replaces the placeholder if
 * present; otherwise replaces the existing id under the `# vulse:d1` block.
 * Idempotent: writing the same id twice yields the same output.
 */
export function setDatabaseId(toml: string, id: string): string {
  if (toml.includes(`database_id = "${id}"`)) return toml
  if (toml.includes(PLACEHOLDER_DB_ID)) {
    return toml.replace(PLACEHOLDER_DB_ID, id)
  }
  return toml.replace(/database_id = "[^"]*"/, `database_id = "${id}"`)
}

/**
 * Set/replace KEY=VALUE entries in a `.dev.vars`-style file. Existing entries
 * for the same key are replaced in place; unknown keys are appended. Values
 * are written as `KEY="value"` (double-quoted) to handle special chars safely.
 * Pre-existing keys not in `vars` are left untouched.
 */
export function applyDevVars(existing: string, vars: Record<string, string>): string {
  let out = existing
  const trailingNewline = out.length === 0 || out.endsWith('\n')
  if (!trailingNewline) out += '\n'

  for (const [key, value] of Object.entries(vars)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const line = `${key}="${escaped}"`
    const re = new RegExp(`^${key}\\s*=.*$`, 'm')
    if (re.test(out)) {
      out = out.replace(re, line)
    } else {
      out += `${line}\n`
    }
  }
  return out
}

/** Ensure `.dev.vars` (and `.dev.vars.*`) appear in .gitignore. */
export function ensureGitignored(existing: string, entry = '.dev.vars'): string {
  const lines = existing.split('\n').map((l) => l.trim())
  if (lines.includes(entry)) return existing
  const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  return `${existing}${sep}${entry}\n`
}

interface Prompter {
  ask(question: string, defaultValue?: string): Promise<string>
  confirm(question: string, defaultYes: boolean): Promise<boolean>
  close(): void
}

function createPrompter(autoYes: boolean): Prompter {
  const rl = autoYes ? null : createInterface({ input: stdin, output: stdout })
  return {
    async ask(question, defaultValue) {
      if (autoYes) return defaultValue ?? ''
      const suffix = defaultValue ? ` [${defaultValue}]` : ''
      const answer = (await rl!.question(`${question}${suffix}: `)).trim()
      return answer || (defaultValue ?? '')
    },
    async confirm(question, defaultYes) {
      if (autoYes) return true
      const suffix = defaultYes ? ' [Y/n]' : ' [y/N]'
      const answer = (await rl!.question(`${question}${suffix} `)).trim().toLowerCase()
      if (!answer) return defaultYes
      return answer === 'y' || answer === 'yes'
    },
    close() { rl?.close() },
  }
}

function tryRun(cmd: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] })
    return { ok: true, output }
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message: string }
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? ''
    return { ok: false, error: stderr || e.message }
  }
}

/** Pull a database_id out of `wrangler d1 create` JSON-ish output. */
export function parseDatabaseId(output: string): string | null {
  const m = output.match(/database_id\s*=?\s*"?([0-9a-f-]{20,})"?/i)
  return m ? m[1]! : null
}

export async function runSetup(opts: SetupOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const prompter = createPrompter(!!opts.yes)

  try {
    stdout.write(`\nVulse setup — local development\n\n`)
    stdout.write(`This wizard will update:\n`)
    stdout.write(`  • wrangler config   (D1 + R2 bindings)\n`)
    stdout.write(`  • ${DEV_VARS_FILE}    (local secrets — gitignored)\n`)
    stdout.write(`  • ${GITIGNORE_FILE}    (adds ${DEV_VARS_FILE})\n\n`)

    if (!(await prompter.confirm('Continue?', true))) {
      stdout.write('Aborted.\n')
      return
    }

    // --- Step 1: D1 ---
    stdout.write(`\nStep 1/3 — Cloudflare D1 (database)\n`)
    const wranglerFile = (await findWranglerConfig(cwd)) ?? WRANGLER_FILE
    const wranglerPath = join(cwd, wranglerFile)
    let wranglerConfig = await readIfExists(wranglerPath)
    const d1Name = await prompter.ask('  D1 database name', 'vulse-db')
    wranglerConfig = patchWranglerConfig(wranglerConfig, wranglerFile, { d1Name, r2Bucket: 'vulse-media' })

    let databaseId = await prompter.ask(
      '  D1 database_id (leave blank to create one now)',
      '',
    )
    if (!databaseId) {
      if (await prompter.confirm(`  Run \`wrangler d1 create ${d1Name}\`?`, true)) {
        const result = tryRun(`wrangler d1 create ${d1Name}`)
        if (result.ok) {
          databaseId = parseDatabaseId(result.output) ?? ''
          if (databaseId) {
            stdout.write(`  ✓ database_id: ${databaseId}\n`)
          } else {
            stdout.write(`  ! Could not parse database_id from wrangler output.\n`)
            stdout.write(result.output)
            databaseId = await prompter.ask('  Paste the database_id', '')
          }
        } else {
          stdout.write(`  ! \`wrangler d1 create\` failed: ${result.error.trim()}\n`)
          databaseId = await prompter.ask(
            '  Paste an existing database_id, or press Enter to leave the placeholder',
            '',
          )
        }
      }
    }
    if (databaseId) wranglerConfig = setDatabaseId(wranglerConfig, databaseId)

    // --- Step 2: R2 ---
    stdout.write(`\nStep 2/3 — Cloudflare R2 (media storage)\n`)
    const r2Bucket = await prompter.ask('  R2 bucket name', 'vulse-media')
    wranglerConfig = patchWranglerConfig(wranglerConfig, wranglerFile, { d1Name, r2Bucket })
    if (await prompter.confirm(`  Run \`wrangler r2 bucket create ${r2Bucket}\`?`, true)) {
      const result = tryRun(`wrangler r2 bucket create ${r2Bucket}`)
      if (result.ok) {
        stdout.write(`  ✓ bucket created\n`)
      } else if (/already exists/i.test(result.error)) {
        stdout.write(`  ✓ bucket already exists — using it\n`)
      } else {
        stdout.write(`  ! \`wrangler r2 bucket create\` failed: ${result.error.trim()}\n`)
        stdout.write(`    Continuing — you can create it later.\n`)
      }
    }

    await writeFile(wranglerPath, wranglerConfig, 'utf8')
    stdout.write(`  ✓ wrote ${wranglerFile}\n`)

    // --- Step 3: Secrets + .dev.vars ---
    stdout.write(`\nStep 3/3 — Secrets\n`)
    const devVarsPath = join(cwd, DEV_VARS_FILE)
    const existingDevVars = await readIfExists(devVarsPath)

    const newVars: Record<string, string> = {}
    if (!/^BETTER_AUTH_SECRET\s*=/m.test(existingDevVars)) {
      newVars.BETTER_AUTH_SECRET = generateSecret()
      stdout.write(`  ✓ generated BETTER_AUTH_SECRET\n`)
    } else {
      stdout.write(`  ✓ BETTER_AUTH_SECRET already set — keeping it\n`)
    }
    if (!/^VULSE_PREVIEW_SECRET\s*=/m.test(existingDevVars)) {
      newVars.VULSE_PREVIEW_SECRET = generateSecret()
      stdout.write(`  ✓ generated VULSE_PREVIEW_SECRET\n`)
    } else {
      stdout.write(`  ✓ VULSE_PREVIEW_SECRET already set — keeping it\n`)
    }

    if (Object.keys(newVars).length > 0) {
      const updated = applyDevVars(existingDevVars, newVars)
      await writeFile(devVarsPath, updated, 'utf8')
      stdout.write(`  ✓ wrote ${DEV_VARS_FILE}\n`)
    }

    // Warn if wrangler.toml still has the placeholder BETTER_AUTH_SECRET — .dev.vars
    // overrides it in dev, but the placeholder is misleading.
    if (wranglerConfig.includes(PLACEHOLDER_AUTH_SECRET)) {
      stdout.write(
        `  ℹ ${WRANGLER_FILE} still contains the placeholder BETTER_AUTH_SECRET in [vars].\n` +
        `    ${DEV_VARS_FILE} takes precedence in dev — you can remove the [vars] line.\n`,
      )
    }

    // .gitignore
    const gitignorePath = join(cwd, GITIGNORE_FILE)
    const existingGitignore = await readIfExists(gitignorePath)
    const updatedGitignore = ensureGitignored(existingGitignore)
    if (updatedGitignore !== existingGitignore) {
      await writeFile(gitignorePath, updatedGitignore, 'utf8')
      stdout.write(`  ✓ added ${DEV_VARS_FILE} to ${GITIGNORE_FILE}\n`)
    }

    // --- Migrate ---
    if (!opts.skipMigrate && databaseId) {
      stdout.write(`\nApplying migrations…\n`)
      try {
        await runMigrate({ remote: false })
      } catch (err) {
        stdout.write(`  ! migrate failed: ${(err as Error).message}\n`)
        stdout.write(`    Run \`npx vulse migrate\` manually once D1 is reachable.\n`)
      }
    } else if (!databaseId) {
      stdout.write(`\nSkipping migrations — no database_id set yet.\n`)
      stdout.write(`Paste the id into ${WRANGLER_FILE}, then run: npx vulse migrate\n`)
    }

    // --- Seed admin ---
    if (!opts.skipSeed && databaseId) {
      stdout.write(`\nFirst admin user\n`)
      const email = opts.email ?? (await prompter.ask('  Admin email (blank to skip)', ''))
      if (email) {
        try {
          await runSeedAdmin({
            email,
            remote: false,
            ...(opts.password !== undefined ? { password: opts.password } : {}),
          })
        } catch (err) {
          stdout.write(`  ! seed:admin failed: ${(err as Error).message}\n`)
          stdout.write(`    Run \`npx vulse seed:admin --email ${email}\` manually.\n`)
        }
      } else {
        stdout.write(`  Skipped — create one later with: npx vulse seed:admin --email you@example.com\n`)
      }
    }

    stdout.write(`\nDone. Start your dev server and open /admin/login.\n\n`)
  } finally {
    prompter.close()
  }
}
