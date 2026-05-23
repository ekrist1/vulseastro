import type { Loader } from 'astro/loaders'
import { createDb } from '../core/db.js'
import { EntriesRepo } from '../core/repos/entries.js'

export interface VulseLoaderOptions {
  collection: string
  locale?: string
}

declare global {
  // eslint-disable-next-line no-var
  var __VULSE_TEST_DB__: D1Database | undefined
}

function resolveBinding(ctx: unknown): D1Database {
  const c = ctx as { _vulseTestBinding?: D1Database }
  if (c._vulseTestBinding) return c._vulseTestBinding
  if (globalThis.__VULSE_TEST_DB__) return globalThis.__VULSE_TEST_DB__
  throw new Error('vulseLoader: no D1 binding available. See https://vulse.dev/docs/loader-binding')
}

export function vulseLoader(opts: VulseLoaderOptions): Loader {
  return {
    name: `vulse-loader-${opts.collection}`,
    load: async (ctx) => {
      const includeDrafts = (ctx as { _vulseIncludeDrafts?: boolean })._vulseIncludeDrafts ?? false
      const db = createDb(resolveBinding(ctx))
      const repo = new EntriesRepo(db)
      const rows = await repo.list({
        collection: opts.collection,
        ...(includeDrafts ? {} : { status: 'published' }),
      })

      ctx.store.clear()
      for (const r of rows) {
        if (opts.locale && r.locale !== opts.locale) continue
        await ctx.store.set({
          id: r.id,
          digest: `v${r.version}`,
          data: {
            ...((r.content as Record<string, unknown>) ?? {}),
            id: r.id,
            slug: r.slug,
            status: r.status,
            publishedAt: r.publishedAt?.toISOString() ?? null,
            updatedAt: r.updatedAt.toISOString(),
          },
        })
      }
    },
  }
}
