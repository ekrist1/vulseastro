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

export default function vulse(opts: VulseOptions = {}): AstroIntegration {
  return {
    name: 'vulse',
    hooks: {
      'astro:config:setup': async (params) => {
        // Keep runtime helper imports from eagerly evaluating Astro/Vite integration code.
        const { default: createVulseIntegration } = await import('./integration/index.js')
        const integration = createVulseIntegration(opts)
        await integration.hooks?.['astro:config:setup']?.(params)
      },
    },
  }
}
