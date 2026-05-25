import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { injectVulseRoutes } from './inject-routes.js'
import { injectVulseAdminRoutes } from './inject-admin-routes.js'
import { vulseBlueprintsPlugin } from './vite-plugin-blueprints.js'
import { vulseAdminCssPlugin, vulseAdminFsAllow } from './vite-plugin-admin-css.js'
import { createVulseViteLogger } from './vite-logger.js'
import { vulseSuppressSourcemapsPlugin } from './vite-plugin-suppress-sourcemaps.js'
import { generateBlueprintTypes } from './type-gen.js'
import { initLoaderBinding } from './loader-binding.js'
import { ensureWranglerConfig } from './wrangler-config.js'
import { setVulsePlugins } from '../server/plugins.js'
import type { VulsePlugin } from '../core/plugins/definition.js'

/** Node built-ins the Cloudflare workerd runtime provides when nodejs_compat is enabled. */
const SSR_NODE_EXTERNAL = [
  'node:async_hooks',
  'blake3-wasm',
] as const

/** Packages that break Vite dep pre-bundling (native bindings, dev-only tools). */
const OPTIMIZE_DEPS_EXCLUDE = [
  'better-auth',
  'better-auth/adapters/drizzle',
  'drizzle-orm',
  'drizzle-orm/d1',
  'drizzle-orm/sqlite-core',
  'nanoid',
  'astro/zod',
  '@tailwindcss/vite',
  '@tailwindcss/oxide',
  '@tailwindcss/node',
  'tailwindcss',
  '@babel/core',
  '@babel/preset-typescript',
  'blake3-wasm',
] as const

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
        await ensureWranglerConfig(root)
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
            customLogger: createVulseViteLogger(),
            plugins: [
              vulseSuppressSourcemapsPlugin(),
              vulseAdminCssPlugin(),
              tailwindcss(),
              vulseBlueprintsPlugin(root),
            ],
            server: {
              fs: { allow: vulseAdminFsAllow(root) },
            },
            optimizeDeps: {
              exclude: [...OPTIMIZE_DEPS_EXCLUDE],
            },
            ssr: {
              // Let workerd provide Node compat built-ins (better-auth uses AsyncLocalStorage).
              external: [...SSR_NODE_EXTERNAL],
              // Bundle vulse in-process for Cloudflare's module runner; avoid
              // noExternal: true — it pulls native dev deps (tailwind oxide, babel) into SSR.
              noExternal: ['@vulsecms/core', '@astrojs/vue'],
              optimizeDeps: {
                exclude: [...OPTIMIZE_DEPS_EXCLUDE],
              },
            },
          },
        })
      },
    },
  }
}
