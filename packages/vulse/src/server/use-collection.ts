import { registryForRequest } from '../core/blueprints/load.js'
import type { BlueprintRegistry } from '../core/blueprints/registry.js'
import type { AuthContext } from '../core/blueprints/types.js'
import { createDb } from '../core/db.js'
import type { EntryRow } from '../core/repos/entries.js'
import { resolvePreviewContent, type PreviewLocals } from '../core/preview-content.js'
import { getRuntimeEnv } from './env.js'
import { getRuntime, type VulseRuntime } from './runtime.js'
import type { CollectionFindOptions, CollectionSdkOptions } from './sdk/collections.js'

export type { CollectionFindOptions, CollectionSdkOptions } from './sdk/collections.js'
export type { EntryRow } from '../core/repos/entries.js'

export interface AstroCollectionContext {
  request: Request
  url: URL
  locals: PreviewLocals
}

export interface RequestContext {
  rt: VulseRuntime
  registry: BlueprintRegistry
  session: Awaited<ReturnType<VulseRuntime['auth']['api']['getSession']>>
  audience: AuthContext['user']
}

export async function createRequestContext(
  astro: Pick<AstroCollectionContext, 'request' | 'url'>,
): Promise<RequestContext> {
  const env = getRuntimeEnv()
  const db = createDb(env.DB)
  const registry = await registryForRequest(db)
  const rt = await getRuntime(env, registry, astro.url.origin)
  const session = await rt.auth.api.getSession({ headers: astro.request.headers })
  return {
    rt,
    registry,
    session,
    audience: (session?.user ?? null) as AuthContext['user'],
  }
}

export type UseCollectionListOptions = Omit<CollectionFindOptions, 'audience'> & {
  audience?: CollectionFindOptions['audience']
}

export type UseCollectionEntryOptions = Omit<CollectionSdkOptions, 'audience'> & {
  slug: string
  /** Resolve draft/live preview content (default: true) */
  preview?: boolean
  audience?: CollectionSdkOptions['audience']
}

export interface UseCollectionListResult {
  entries: EntryRow[]
  session: RequestContext['session']
  registry: BlueprintRegistry
}

export interface UseCollectionEntryResult {
  entry: EntryRow | null
  content: unknown | null
  session: RequestContext['session']
  registry: BlueprintRegistry
}

function resolveAudience(
  options: { audience?: CollectionSdkOptions['audience'] },
  ctx: RequestContext,
): AuthContext['user'] {
  if (options.audience !== undefined) return options.audience ?? null
  return ctx.audience ?? null
}

export async function useCollection(
  astro: AstroCollectionContext,
  collection: string,
  options: UseCollectionEntryOptions,
): Promise<UseCollectionEntryResult>

export async function useCollection(
  astro: AstroCollectionContext,
  collection: string,
  options?: UseCollectionListOptions,
): Promise<UseCollectionListResult>

export async function useCollection(
  astro: AstroCollectionContext,
  collection: string,
  options: UseCollectionListOptions & Partial<UseCollectionEntryOptions> = {},
): Promise<UseCollectionListResult | UseCollectionEntryResult> {
  const ctx = await createRequestContext(astro)
  const audience = resolveAudience(options, ctx)

  if (options.slug) {
    const { slug, preview, audience: _audience, ...sdkOpts } = options
    const entry = await ctx.rt.sdk.collections.findBySlug(collection, slug, {
      ...sdkOpts,
      audience,
    })
    const content = preview !== false && entry
      ? resolvePreviewContent(entry, astro.locals)
      : entry?.content ?? null
    return { entry, content, session: ctx.session, registry: ctx.registry }
  }

  const { slug: _slug, preview: _preview, audience: _audience, ...findOpts } = options
  const entries = await ctx.rt.sdk.collections.find(collection, {
    ...findOpts,
    audience,
  })
  return { entries, session: ctx.session, registry: ctx.registry }
}
