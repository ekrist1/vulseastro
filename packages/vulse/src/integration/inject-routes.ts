import type { AstroIntegrationLogger } from 'astro'
import { fileURLToPath } from 'node:url'

const HERE = (rel: string) => fileURLToPath(new URL(`../server/endpoints/${rel}`, import.meta.url))

export interface InjectArgs {
  injectRoute: (r: { pattern: string; entrypoint: string; prerender?: boolean }) => void
  logger: AstroIntegrationLogger
}

export function injectVulseRoutes({ injectRoute, logger }: InjectArgs) {
  const routes: Array<{ pattern: string; file: string }> = [
    { pattern: '/api/vulse/entries/[collection]', file: 'api-vulse-entries.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]', file: 'api-vulse-entries.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/revisions', file: 'api-vulse-revisions.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/revisions/[version]/restore', file: 'api-vulse-revisions-restore.js' },
    { pattern: '/api/vulse/users', file: 'api-vulse-users.js' },
    { pattern: '/api/vulse/users/[id]/role', file: 'api-vulse-users-role.js' },
    { pattern: '/api/auth/[...all]', file: 'api-auth.js' },
  ]
  for (const r of routes) {
    injectRoute({ pattern: r.pattern, entrypoint: HERE(r.file), prerender: false })
    logger.info(`Vulse: injected ${r.pattern}`)
  }
}
