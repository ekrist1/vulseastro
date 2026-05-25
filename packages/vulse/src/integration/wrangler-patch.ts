import { VULSE_PACKAGE } from '../package-name.js'

export interface PatchOptions {
  d1Name: string
  r2Bucket: string
}

export const VULSE_MIGRATIONS_DIR = `node_modules/${VULSE_PACKAGE}/migrations`

/**
 * Default compatibility_date written when a wrangler config has none. A config
 * missing this key makes the Cloudflare adapter restart the dev server on every
 * patch, which aborts in-flight requests (e.g. login POSTs).
 */
export const DEFAULT_COMPATIBILITY_DATE = '2025-01-01'

const D1_MARKER = '# vulse:d1'
const R2_MARKER = '# vulse:r2'

export function patchWranglerToml(input: string, opts: PatchOptions): string {
  const hasD1 = input.includes(D1_MARKER)
  const hasR2 = input.includes(R2_MARKER)

  let out = input
  if (!hasD1) {
    out += `\n${D1_MARKER}\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${opts.d1Name}"\ndatabase_id = "TODO_PASTE_ID_FROM_WRANGLER_OUTPUT"\nmigrations_dir = "${VULSE_MIGRATIONS_DIR}"\n`
  }
  if (!hasR2) {
    out += `\n${R2_MARKER}\n[[r2_buckets]]\nbinding = "BUCKET"\nbucket_name = "${opts.r2Bucket}"\n`
  }
  // A bare TOML key appended at the end would bind to the last [[table]]
  // section, so root keys are prepended at the top.
  if (!/compatibility_date = "[^"]+"/.test(out)) {
    out = `compatibility_date = "${DEFAULT_COMPATIBILITY_DATE}"\n${out}`
  }
  if (!out.includes('nodejs_compat')) {
    out = out.replace(/compatibility_date = "[^"]+"/, (m) => `${m}\ncompatibility_flags = ["nodejs_compat"]`)
  }
  return out
}
