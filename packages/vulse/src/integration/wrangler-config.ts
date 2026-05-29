import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { patchWranglerToml, VULSE_MIGRATIONS_DIR, DEFAULT_COMPATIBILITY_DATE, type PatchOptions } from './wrangler-patch.js'

export const WRANGLER_CONFIG_FILES = ['wrangler.jsonc', 'wrangler.toml', 'wrangler.json'] as const
const WRANGLER_FILES = WRANGLER_CONFIG_FILES
const DEFAULT_PATCH: PatchOptions = { d1Name: 'vulse-db', r2Bucket: 'vulse-media' }

export type WranglerConfigFile = (typeof WRANGLER_FILES)[number]
export const DEFAULT_WRANGLER_CONFIG_FILE: WranglerConfigFile = 'wrangler.jsonc'

const WRANGLER_CONFIG_NOT_FOUND =
  'No wrangler config found (wrangler.jsonc, wrangler.toml, or wrangler.json). Run this command from your Astro project root.'

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

/** Prefer the wrangler file Astro/Cloudflare already created in `cwd`. */
export async function findWranglerConfig(cwd: string): Promise<WranglerConfigFile | null> {
  for (const file of WRANGLER_FILES) {
    if (await fileExists(join(cwd, file))) return file
  }
  return null
}

/**
 * Walk up from `cwd` and return the path to the nearest wrangler config file.
 * When `configFile` is given (e.g. `wrangler.production.toml`), that exact file is
 * resolved relative to `cwd` (or used as-is when absolute) instead of auto-detecting.
 */
export async function resolveWranglerConfigPath(cwd = process.cwd(), configFile?: string): Promise<string> {
  if (configFile) {
    const path = isAbsolute(configFile) ? configFile : join(cwd, configFile)
    if (await fileExists(path)) return path
    throw new Error(`Wrangler config not found: ${configFile}`)
  }
  let dir = cwd
  for (;;) {
    for (const file of WRANGLER_FILES) {
      const configPath = join(dir, file)
      if (await fileExists(configPath)) return configPath
    }
    const parent = dirname(dir)
    if (parent === dir) throw new Error(WRANGLER_CONFIG_NOT_FOUND)
    dir = parent
  }
}

export function isJsonWranglerConfig(file: WranglerConfigFile): boolean {
  return file === 'wrangler.jsonc' || file === 'wrangler.json'
}

/**
 * Map an arbitrary wrangler config filename (e.g. `wrangler.production.toml`)
 * to the canonical {@link WranglerConfigFile} that selects its patch format.
 * Extension decides: `.toml` → TOML patcher, `.json`/`.jsonc` → JSONC patcher.
 */
export function wranglerConfigFormat(fileName: string): WranglerConfigFile {
  if (fileName.endsWith('.toml')) return 'wrangler.toml'
  if (fileName.endsWith('.json')) return 'wrangler.json'
  return 'wrangler.jsonc'
}

/**
 * Insert a top-level property block immediately before the config's closing brace.
 * Adds a comma to the preceding property when it lacks a trailing one — otherwise
 * the result is invalid JSON (the common case: a scaffold whose last property has
 * no trailing comma).
 */
function insertJsoncProperty(input: string, block: string): string {
  return input.replace(/^([\s\S]*)\}(\s*)$/, (_match, body: string) => {
    const trimmed = body.replace(/\s+$/, '')
    const needsComma = trimmed.length > 0 && !/[,{]$/.test(trimmed)
    return `${trimmed}${needsComma ? ',' : ''}\n${block}\n}\n`
  })
}

export function patchWranglerJsonc(input: string, opts: PatchOptions = DEFAULT_PATCH): string {
  const D1_MARKER = '// vulse:d1'
  const R2_MARKER = '// vulse:r2'
  let out = input.trimEnd()
  if (!out.endsWith('\n')) out += '\n'

  if (!out.includes(D1_MARKER)) {
    if (/["']binding["']\s*:\s*["']DB["']/.test(out) && !out.includes('migrations_dir')) {
      out = out.replace(
        /("binding"\s*:\s*"DB"[\s\S]*?)(}\s*,?\s*(?=\]|,|\n\s*}))/,
        (match, prefix: string, suffix: string) => {
          if (prefix.includes('migrations_dir')) return match
          const sep = prefix.trimEnd().endsWith(',') ? '\n      ' : ',\n      '
          return `${prefix}${sep}"migrations_dir": "${VULSE_MIGRATIONS_DIR}"${suffix}`
        },
      )
    } else if (!out.includes('"d1_databases"')) {
      const d1Block = `  ${D1_MARKER}
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${opts.d1Name}",
      "database_id": "TODO_PASTE_ID_FROM_WRANGLER_OUTPUT",
      "migrations_dir": "${VULSE_MIGRATIONS_DIR}"
    }
  ],`
      out = insertJsoncProperty(out, d1Block)
    }
  }

  if (!out.includes(R2_MARKER) && !out.includes('"r2_buckets"')) {
    const r2Block = `  ${R2_MARKER}
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "${opts.r2Bucket}"
    }
  ],`
    out = insertJsoncProperty(out, r2Block)
  }

  if (!out.includes('"compatibility_date"')) {
    out = insertJsoncProperty(out, `  "compatibility_date": "${DEFAULT_COMPATIBILITY_DATE}",`)
  }

  if (!out.includes('nodejs_compat')) {
    if (out.includes('"compatibility_flags"')) {
      out = out.replace(
        /"compatibility_flags"\s*:\s*\[(.*?)\]/s,
        (match, flags: string) =>
          flags.includes('nodejs_compat') ? match : `"compatibility_flags": [${flags.trim()}${flags.trim() ? ', ' : ''}"nodejs_compat"]`,
      )
    } else if (out.includes('"compatibility_date"')) {
      out = out.replace(
        /"compatibility_date"\s*:\s*"[^"]*"/,
        (m) => `${m},\n  "compatibility_flags": ["nodejs_compat"]`,
      )
    } else {
      out = insertJsoncProperty(out, `  "compatibility_flags": ["nodejs_compat"],`)
    }
  }

  return out
}

export function patchWranglerConfig(
  input: string,
  file: WranglerConfigFile,
  opts: PatchOptions = DEFAULT_PATCH,
): string {
  const patched = isJsonWranglerConfig(file) ? patchWranglerJsonc(input, opts) : patchWranglerToml(input, opts)
  if (patched.includes('migrations_dir')) return patched

  // Cloudflare scaffold may already define D1 without migrations_dir (no vulse marker).
  if (file.endsWith('.toml') && patched.includes('binding = "DB"') && !patched.includes('migrations_dir')) {
    if (patched.includes('database_id = ')) {
      return patched.replace(
        /(database_id = "[^"]*")/,
        `$1\nmigrations_dir = "${VULSE_MIGRATIONS_DIR}"`,
      )
    }
    return patched.replace(
      /(binding = "DB"[^\n]*\n)/,
      `$1migrations_dir = "${VULSE_MIGRATIONS_DIR}"\n`,
    )
  }

  return patched
}

/**
 * Patch an existing wrangler config so migrations point at the bundled package SQL
 * (and D1/R2/nodejs_compat are present). Never creates a config from scratch —
 * that belongs to `vulse setup`, not to every `astro dev`/`build`.
 *
 * When `configFile` is given (e.g. from `WRANGLER_CONFIG=wrangler.production.toml`
 * or `vulse migrate --config`), that exact file is patched instead of auto-detecting
 * the default config in `cwd` — this lets production/staging configs be kept and
 * targeted without overwriting the dev `wrangler.toml`. Throws if the named file
 * does not exist (an explicit selection that's missing is a mistake, not a no-op).
 *
 * Returns the patched file's name/path, or null when no config could be found.
 */
export async function ensureWranglerConfig(
  cwd: string,
  opts: PatchOptions = DEFAULT_PATCH,
  configFile?: string,
): Promise<string | null> {
  let path: string
  let format: WranglerConfigFile
  if (configFile) {
    path = isAbsolute(configFile) ? configFile : join(cwd, configFile)
    if (!(await fileExists(path))) {
      throw new Error(`Wrangler config not found: ${configFile}`)
    }
    format = wranglerConfigFormat(configFile)
  } else {
    const existing = await findWranglerConfig(cwd)
    if (!existing) return null
    path = join(cwd, existing)
    format = existing
  }
  const before = await readFile(path, 'utf8')
  const after = patchWranglerConfig(before, format, opts)
  if (after !== before) await writeFile(path, after, 'utf8')
  return configFile ?? format
}
