import type { RuntimeEnv } from './env.js'
import { VULSE_VERSION } from './version.js'
import { PLACEHOLDER_AUTH_SECRET } from './placeholder-auth-secret.js'

export interface VulseStatus {
  mode: 'development' | 'production'
  database: 'local SQLite' | 'remote D1'
  version: string
  bindings: { db: boolean; bucket: boolean; queue: boolean; images: boolean }
  warnings: string[]
}

/**
 * Compute a snapshot of the running Vulse environment for the admin Status view.
 * Pure and side-effect-free; never throws.
 *
 * `isDev` defaults to `import.meta.env.DEV` (true under `astro dev` → local Miniflare
 * SQLite; false in a built/deployed worker → remote D1). It is a parameter so unit
 * tests can exercise both modes — under vitest `import.meta.env.DEV` is always truthy.
 */
export function getVulseStatus(
  env: RuntimeEnv,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isDev: boolean = (import.meta as any).env?.DEV ?? false,
): VulseStatus {
  const mode = isDev ? 'development' : 'production'
  const warnings: string[] = []

  if (env.BETTER_AUTH_SECRET === PLACEHOLDER_AUTH_SECRET) {
    warnings.push('BETTER_AUTH_SECRET is still the placeholder value — set a strong secret before going to production.')
  }
  if (mode === 'production' && env.VULSE_ALLOW_MEMBER_SIGNUP === 'true') {
    warnings.push('Public member sign-up is enabled in production (VULSE_ALLOW_MEMBER_SIGNUP="true").')
  }

  return {
    mode,
    database: isDev ? 'local SQLite' : 'remote D1',
    version: VULSE_VERSION,
    bindings: {
      db: !!env.DB,
      bucket: !!env.BUCKET,
      queue: !!env.FORM_QUEUE,
      images: !!(env.CF_IMAGES_ACCOUNT_HASH && env.CF_IMAGES_TOKEN),
    },
    warnings,
  }
}
