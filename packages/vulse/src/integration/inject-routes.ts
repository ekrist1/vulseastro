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
    { pattern: '/api/vulse/entries/[collection]/[id]/locales', file: 'api-vulse-entries-locales.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/move', file: 'api-vulse-entries-move.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/publish', file: 'api-vulse-entries-publish.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/revisions', file: 'api-vulse-revisions.js' },
    { pattern: '/api/vulse/entries/[collection]/[id]/revisions/[version]/restore', file: 'api-vulse-revisions-restore.js' },
    { pattern: '/api/vulse/users', file: 'api-vulse-users.js' },
    { pattern: '/api/vulse/users/[id]', file: 'api-vulse-users-id.js' },
    { pattern: '/api/vulse/users/[id]/role', file: 'api-vulse-users-role.js' },
    { pattern: '/api/vulse/users/[id]/reset-password', file: 'api-vulse-users-reset-password.js' },
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
    { pattern: '/api/vulse/preview/sessions', file: 'api-vulse-preview-sessions.js' },
    { pattern: '/api/vulse/preview/sessions/[id]', file: 'api-vulse-preview-sessions-id.js' },
    { pattern: '/api/vulse/preview/bridge.js', file: 'api-vulse-preview-bridge.js' },
    { pattern: '/api/vulse/forms', file: 'api-vulse-forms.js' },
    { pattern: '/api/vulse/forms/[handle]', file: 'api-vulse-form-handle.js' },
    { pattern: '/api/vulse/forms/[handle]/submissions', file: 'api-vulse-form-handle.js' },
    { pattern: '/api/vulse/forms/[handle]/submissions/delete', file: 'api-vulse-form-handle.js' },
    { pattern: '/api/vulse/forms/[handle]/submissions/[id]', file: 'api-vulse-form-handle.js' },
    { pattern: '/api/vulse/forms/[handle]/public', file: 'api-vulse-form-public.js' },
    { pattern: '/api/vulse/forms/[handle]/submit', file: 'api-vulse-form-submit.js' },
    { pattern: '/api/vulse/forms/[handle]/upload', file: 'api-vulse-form-upload.js' },
    { pattern: '/api/vulse/globals', file: 'api-vulse-globals.js' },
    { pattern: '/api/vulse/globals/[handle]', file: 'api-vulse-globals-handle.js' },
    { pattern: '/api/vulse/globals/[handle]/value', file: 'api-vulse-globals-value.js' },
    { pattern: '/api/vulse/public/globals', file: 'api-vulse-globals-public.js' },
    { pattern: '/api/vulse/public/globals/[handle]', file: 'api-vulse-globals-public-handle.js' },
    { pattern: '/api/auth/[...all]', file: 'api-auth.js' },
  ]
  for (const r of routes) {
    injectRoute({ pattern: r.pattern, entrypoint: HERE(r.file), prerender: false })
    logger.info(`Vulse: injected ${r.pattern}`)
  }
}
