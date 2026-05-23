import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { injectVulseRoutes } from './inject-routes.js'
import { vulseBlueprintsPlugin } from './vite-plugin-blueprints.js'

export interface VulseOptions {
  /** Override the admin route prefix. Defaults to `/admin`. */
  adminPath?: string
}

export default function vulse(_opts: VulseOptions = {}): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': ({ injectRoute, logger, config, updateConfig }) => {
        injectVulseRoutes({ injectRoute, logger })
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
