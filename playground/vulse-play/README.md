# vulse-play

A working Astro project that consumes the local `@ekrist1/vulse` package via `workspace:*`. Use it to develop and exercise changes to Vulse end-to-end.

## First run

From the repo root:

```bash
pnpm install
pnpm --filter @ekrist1/vulse build      # compile vulse so the workspace symlink points at a real dist
cd playground/vulse-play
npx vulse migrate              # apply migrations to local miniflare D1
pnpm dev
```

Open the URL printed by Astro (usually `http://localhost:4321`).

## Seeding an admin

```bash
npx vulse seed:admin --email admin@example.com
```

A random password is generated and printed once. Sign in at `/admin/login`.

## Member sign-up (playground)

Public sign-up is enabled via `VULSE_ALLOW_MEMBER_SIGNUP=true` in `wrangler.toml`. Create a member account at `/sign-up`, or disable sign-up in **Admin → Settings → Auth** and remove that var for production-like behavior.

## Iterating on changes to Vulse

When you change something in `packages/vulse/src/`:

```bash
pnpm --filter @ekrist1/vulse build
```

Then restart `pnpm dev` in this directory. The integration is only re-evaluated on dev-server start, so HMR doesn't pick up changes to the package automatically.

For test-driven development you usually don't need the playground:

```bash
pnpm --filter @ekrist1/vulse test               # unit tests
pnpm --filter @ekrist1/vulse test:integration   # D1 + Workers runtime tests
```

## More

- [Vulse documentation](../../docs/)
- [Repository README](../../README.md)
