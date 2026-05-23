import type { AstroIntegration } from 'astro'

export interface VulseOptions {
  /** Override the admin route prefix. Defaults to `/admin`. */
  adminPath?: string
}

export default function vulse(opts: VulseOptions = {}): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': async ({ logger, command }) => {
        if (command === 'dev' || command === 'build') {
          logger.info('Vulse integration active')
        }
      },
      'astro:server:setup': () => {},
    },
  }
}
