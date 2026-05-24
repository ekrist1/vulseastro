import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { injectVulseRoutes } from './inject-routes.js'
import { injectVulseAdminRoutes } from './inject-admin-routes.js'
import { vulseBlueprintsPlugin } from './vite-plugin-blueprints.js'
import { generateBlueprintTypes } from './type-gen.js'
import { initLoaderBinding } from './loader-binding.js'
import { setVulsePlugins } from '../server/plugins.js'
import type { VulsePlugin } from '../core/plugins/definition.js'

export interface VulseOptions {
  /** Override the admin route prefix. Defaults to `/admin`. */
  adminPath?: string
  plugins?: VulsePlugin[]
}

export default function vulse(opts: VulseOptions = {}): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': async ({ injectRoute, addMiddleware, logger, config, updateConfig }) => {
        setVulsePlugins(opts.plugins ?? [])
        const root = typeof config.root === 'string' ? config.root : fileURLToPath(config.root)
        await generateBlueprintTypes(root)
        await initLoaderBinding(root)
        injectVulseRoutes({ injectRoute, logger })
        injectVulseAdminRoutes({
          injectRoute,
          logger,
          ...(opts.adminPath !== undefined ? { adminPath: opts.adminPath } : {}),
        })
        addMiddleware({ entrypoint: new URL('./middleware.js', import.meta.url), order: 'pre' })
        updateConfig({
          integrations: [vue()],
          vite: {
            plugins: [tailwindcss(), vulseBlueprintsPlugin(root)],
            ssr: {
              // Bundle SSR graph in-process; skip dep pre-bundling for server libs that
              // trigger staggered optimizeDeps reloads under Cloudflare's module runner.
              noExternal: true,
              optimizeDeps: {
                exclude: [
                  'better-auth',
                  'better-auth/adapters/drizzle',
                  'drizzle-orm',
                  'drizzle-orm/d1',
                  'drizzle-orm/sqlite-core',
                  'nanoid',
                  'astro/zod',
                ],
              },
            },
          },
        })
      },
    },
  }
}
