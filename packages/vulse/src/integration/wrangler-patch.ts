import { VULSE_PACKAGE } from '../package-name.js'

export interface PatchOptions {
  d1Name: string
  r2Bucket: string
}

export const VULSE_MIGRATIONS_DIR = `node_modules/${VULSE_PACKAGE}/migrations`

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
  if (!out.includes('nodejs_compat')) {
    if (/compatibility_date = "[^"]+"/.test(out)) {
      out = out.replace(/compatibility_date = "[^"]+"/, (m) => `${m}\ncompatibility_flags = ["nodejs_compat"]`)
    } else {
      // No compatibility_date to anchor to. Prepend at the root — a bare TOML key
      // appended at the end would bind to the last [[table]] section, not the root.
      out = `compatibility_flags = ["nodejs_compat"]\n${out}`
    }
  }
  return out
}
