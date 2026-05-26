import type { AstroIntegration } from 'astro'
import type { VulseOptions } from './integration/index.js'

export { VULSE_VERSION } from './version.js'
export type { VulseOptions } from './integration/index.js'
export { defineCollection, z } from './core/blueprints/define.js'
export { blocks, media, ref, entry, entries, link, grid } from './core/blueprints/zod-helpers.js'
export type { LinkValue, SelectOption } from './core/blueprints/definition.js'
export { definePlugin } from './core/plugins/definition.js'
export type { Blueprint, Role, AuthContext, AccessArgs, AccessFn } from './core/blueprints/types.js'
export type { SeoContent, SeoFieldMapping, ResolvedSeo } from './core/blueprints/seo.js'
export { resolveEffectiveSeo, resolvedSeoSummary } from './core/blueprints/seo.js'
export type { Block, BlockType } from './core/blocks/schema.js'
export type {
  AuthUserBeforeCreateResult,
  AuthUserCreateEvent,
  AuthUserCreateInput,
  AuthUserCreatedEvent,
  FormAfterSubmitEvent,
  FormBeforeSubmitEvent,
  FormBeforeSubmitResult,
  FormProcessEvent,
  VulsePlugin,
  VulsePluginContext,
  VulsePluginHooks,
} from './core/plugins/definition.js'
export { BUILT_IN_BLOCK_TYPES } from './core/blocks/schema.js'

/**
 * Default export so `astro add @vulsecms/core` (and `import vulse from '@vulsecms/core'`)
 * resolve the integration from the package root. The heavy integration module is loaded
 * lazily inside the hook — keeping runtime helper imports (e.g. `defineCollection`) from
 * eagerly evaluating Astro/Vite/Node-only integration code in the worker bundle.
 */
export default function vulse(opts: VulseOptions = {}): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': async (params) => {
        const { default: createVulseIntegration } = await import('./integration/index.js')
        const integration = createVulseIntegration(opts)
        await integration.hooks?.['astro:config:setup']?.(params)
      },
    },
  }
}
