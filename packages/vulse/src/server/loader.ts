/**
 * The Astro content-layer adapter — the ONE module that intentionally tracks
 * Astro's `astro/loaders` API (`Loader` / `LoaderContext` / `ctx.store`).
 *
 * This is the most churn-prone Astro surface: the Content Layer API is younger
 * and moves faster than Astro's integration or route APIs. The framework seam is
 * kept deliberately thin so an Astro major is a fix *here* (plus the other
 * adapter modules), not a change to the framework-agnostic core. The core
 * (`src/core/**`) and the request/runtime layer (`src/server/routes/**`,
 * `handler.ts`, `runtime.ts`) import zero Astro — enforced by
 * `tests/unit/astro-seam.test.ts`, which also asserts `astro/loaders` is
 * imported only here.
 *
 * On an Astro major, re-verify against the upstream changelog:
 *   - the `Loader` shape (`name`, `load(ctx)`)
 *   - `LoaderContext` (`ctx.store`, `ctx.parseData`, `ctx.meta`, …)
 *   - the `DataStore` API used below (`store.set`, `store.clear`, …)
 * See docs/architecture.md for the full seam.
 */
import type { Loader } from 'astro/loaders'
import { createDb } from '../core/db.js'
import { readLocalesConfig } from '../core/locales.js'
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
      const locale = opts.locale ?? (await readLocalesConfig(db)).defaultLocale
      const rows = await repo.list({
        collection: opts.collection,
        locale,
        ...(includeDrafts ? {} : { status: 'published' }),
      })

      ctx.store.clear()
      for (const r of rows) {
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
