import type { AstroIntegrationLogger } from 'astro'
import { fileURLToPath } from 'node:url'

const ADMIN = (rel: string) => fileURLToPath(new URL(`../../src/admin/pages/${rel}`, import.meta.url))

export interface InjectAdminArgs {
  injectRoute: (r: { pattern: string; entrypoint: string; prerender?: boolean }) => void
  logger: AstroIntegrationLogger
  adminPath?: string
}

export function injectVulseAdminRoutes({ injectRoute, logger, adminPath = '/admin' }: InjectAdminArgs) {
  const prefix = adminPath.replace(/\/$/, '')
  const routes: Array<{ pattern: string; file: string }> = [
    { pattern: `${prefix}`, file: 'index.astro' },
    { pattern: `${prefix}/login`, file: 'login.astro' },
    { pattern: `${prefix}/collections/[name]`, file: 'collections/[name]/index.astro' },
    { pattern: `${prefix}/collections/[name]/new`, file: 'collections/[name]/new.astro' },
    { pattern: `${prefix}/collections/[name]/[id]`, file: 'collections/[name]/[id].astro' },
    { pattern: `${prefix}/users`, file: 'users/index.astro' },
    { pattern: `${prefix}/users/[id]`, file: 'users/[id].astro' },
    { pattern: `${prefix}/settings`, file: 'settings/index.astro' },
  ]
  for (const r of routes) {
    injectRoute({ pattern: r.pattern, entrypoint: ADMIN(r.file), prerender: false })
    logger.info(`Vulse: injected admin route ${r.pattern}`)
  }
}
