import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { injectVulseRoutes } from './inject-routes.js'
import { injectVulseAdminRoutes } from './inject-admin-routes.js'
import { vulseBlueprintsPlugin } from './vite-plugin-blueprints.js'

export interface VulseOptions {
  /** Override the admin route prefix. Defaults to `/admin`. */
  adminPath?: string
}

export default function vulse(opts: VulseOptions = {}): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': ({ injectRoute, addMiddleware, logger, config, updateConfig }) => {
        injectVulseRoutes({ injectRoute, logger })
        injectVulseAdminRoutes({
          injectRoute,
          logger,
          ...(opts.adminPath !== undefined ? { adminPath: opts.adminPath } : {}),
        })
        addMiddleware({ entrypoint: new URL('./middleware.js', import.meta.url), order: 'pre' })
        const root = typeof config.root === 'string' ? config.root : fileURLToPath(config.root)
        updateConfig({
          integrations: [vue()],
          vite: {
            plugins: [tailwindcss(), vulseBlueprintsPlugin(root)],
          },
        })
      },
    },
  }
}
