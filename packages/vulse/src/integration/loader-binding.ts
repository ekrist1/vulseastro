import { resolveWranglerConfigPath } from './wrangler-config.js'

declare global {
  // eslint-disable-next-line no-var
  var __VULSE_TEST_DB__: D1Database | undefined
}

/** Resolves the local D1 binding via wrangler's platform proxy for content-layer sync. */
export async function initLoaderBinding(projectRoot: string): Promise<void> {
  if (globalThis.__VULSE_TEST_DB__) return
  try {
    const { getPlatformProxy } = await import('wrangler')
    const { env } = await getPlatformProxy({ configPath: await resolveWranglerConfigPath(projectRoot) })
    if (env.DB) globalThis.__VULSE_TEST_DB__ = env.DB as D1Database
  } catch {
    // wrangler config missing or platform proxy unavailable (e.g. CI without bindings)
  }
}
