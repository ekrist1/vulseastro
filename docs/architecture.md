# Architecture: the framework seam

Vulse is an Astro-native, Cloudflare-first headless CMS. To keep it maintainable as Astro
evolves, the codebase is split into a **framework-agnostic core** and a thin **Astro adapter**.
The goal: a breaking change in a new Astro major is a fix in the adapter, not a rewrite of the
CMS.

## Two layers

### Framework-agnostic core (zero Astro imports)
Depends only on web standards (`Request`/`Response`/`URL`), Cloudflare D1 (via Drizzle), and
`zod`. It never imports `astro`, `astro/*`, `astro:*`, or `@astrojs/*`.

- `src/core/**` — data layer, blueprints/schema, repos, access control, content parsing.
- `src/server/routes/**`, `src/server/handler.ts`, `src/server/runtime.ts` — the HTTP request
  layer. Handlers take a standard `Request` and return a standard `Response`.

Zod is imported directly from the `zod` package (`import { z } from 'zod'`), **not** via
`astro/zod`, so the core does not depend on the `astro` package at all. (`@vulsecms/core`
pins `zod` to the same v4 range Astro uses, so installs dedupe to one copy.)

### Astro adapter (the only Astro-coupled code)
These modules deliberately speak Astro APIs and are where Astro upgrades land:

- `src/integration/**` — the `vulse()` Astro integration: `injectRoute`, `addMiddleware`,
  Vite plugins, `@astrojs/vue`.
- `src/server/endpoints/**` — thin `APIRoute` shims that call `withRuntime(request)` and
  delegate to the framework-agnostic route handlers.
- `src/server/loader.ts` — the **content-layer adapter** (`astro/loaders`). This is the
  single most churn-prone Astro surface; its header documents what to re-verify on an Astro
  major. It is the only module allowed to import `astro/loaders`.
- `src/admin/pages/**.astro` + `middleware.ts` — admin SSR pages and middleware. The admin UI
  itself is plain Vue (`src/admin/components/**`) and is framework-agnostic.

## The guard

`packages/vulse/tests/unit/astro-seam.test.ts` enforces the seam in CI:

1. The portable core (`src/core/**`, `src/server/routes/**`, `handler.ts`, `runtime.ts`)
   imports no Astro.
2. `astro/loaders` is imported only by `src/server/loader.ts`.
3. No source file imports Zod via `astro/zod`.

If you add Astro to the core by accident, the test fails with the offending file and specifier.

## Upgrading Astro

1. Bump `astro` (and `@astrojs/vue`) and run the suite. The seam guard + typecheck localize
   most breakage to the adapter.
2. Re-verify `src/server/loader.ts` against the Content Layer changelog (`Loader`,
   `LoaderContext`, `DataStore`) — the surface most likely to have changed.
3. Check `src/integration/**` for integration-hook and Vite-plugin API changes.
4. Keep the `zod` dependency range aligned with Astro's so the two stay deduped.
