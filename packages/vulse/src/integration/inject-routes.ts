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
    { pattern: '/api/vulse/entries/[collection]/tree', file: 'api-vulse-entries-tree.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]', file: 'api-vulse-entries.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/move', file: 'api-vulse-entries-move.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/publish', file: 'api-vulse-entries-publish.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/revisions', file: 'api-vulse-revisions.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/revisions/[version]/restore', file: 'api-vulse-revisions-restore.js' },
    { pattern: '/api/vulse/users', file: 'api-vulse-users.js' },
    { pattern: '/api/vulse/users/[id]/role', file: 'api-vulse-users-role.js' },
    { pattern: '/api/vulse/settings', file: 'api-vulse-settings.js' },
    { pattern: '/api/vulse/settings/[key]', file: 'api-vulse-settings.js' },
    { pattern: '/api/vulse/blueprints', file: 'api-vulse-blueprints.js' },
    { pattern: '/api/vulse/blueprints/[handle]', file: 'api-vulse-blueprints.js' },
    { pattern: '/api/vulse/sets', file: 'api-vulse-sets.js' },
    { pattern: '/api/vulse/sets/[handle]', file: 'api-vulse-sets.js' },
    { pattern: '/api/vulse/media', file: 'api-vulse-media.js' },
    { pattern: '/api/vulse/media/[id]', file: 'api-vulse-media-id.js' },
    { pattern: '/api/vulse/media/[id]/file', file: 'api-vulse-media-file.js' },
    { pattern: '/api/vulse/search', file: 'api-vulse-search.js' },
    { pattern: '/api/vulse/preview/start', file: 'api-vulse-preview-start.js' },
    { pattern: '/api/vulse/preview/stop', file: 'api-vulse-preview-stop.js' },
    { pattern: '/api/auth/[...all]', file: 'api-auth.js' },
  ]
  for (const r of routes) {
    injectRoute({ pattern: r.pattern, entrypoint: HERE(r.file), prerender: false })
    logger.info(`Vulse: injected ${r.pattern}`)
  }
}
