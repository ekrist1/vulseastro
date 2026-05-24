# Vulseastro

**Vulse** is an Astro-native, Cloudflare-hosted headless CMS. One deploy serves your public site, the admin UI at `/admin`, and the REST API at `/api/vulse/*`. Content lives in D1, assets in R2, search uses SQLite FTS5, and delivery uses Astro's Content Layer (build/sync) plus a runtime SDK (SSR / members-only content).

This monorepo contains:

| Path | What it is |
|------|------------|
| `packages/vulse/` | The `@ekrist1/vulse` npm package |
| `playground/vulse-play/` | A working reference Astro project that consumes Vulse |
| `docs/` | User-facing documentation |
| `docs/superpowers/` | Internal design specs and implementation plans |

## Quickstart

```bash
pnpm install
pnpm --filter @ekrist1/vulse build
cd playground/vulse-play
npx vulse migrate
pnpm dev
```

Open the URL printed in the terminal (usually `http://localhost:4321`). Admin: `/admin/login`. See [`docs/installation.md`](docs/installation.md) for full setup including creating your first admin user.

## Documentation

| Page | Purpose |
|------|---------|
| [Installation](docs/installation.md) | Prerequisites, install, Cloudflare resources, first admin |
| [Upgrading](docs/upgrading.md) | Updating Vulse and running migrations |
| [Configuration](docs/configuration.md) | `wrangler.toml` bindings, env vars, runtime settings |
| [Control panel](docs/control-panel.md) | Admin UI walkthrough |
| [Content modeling](docs/content-modeling.md) | Blueprints, sets, replicators, globals, locales |
| [Frontend](docs/frontend.md) | Wiring Vulse into Astro (loader, SSR SDK, blocks, auth) |
| [Live preview](docs/live-preview.md) | Live preview and saved-draft preview |
| [Forms](docs/forms.md) | Form builder, spam protection, queues, hooks |
| [Plugins](docs/plugins.md) | Native Vulse plugins for forms, auth, CRM, and email workflows |
| [API reference](docs/api-reference.md) | REST endpoints |
| [CLI reference](docs/cli.md) | `vulse migrate`, `seed:admin`, `collection:scaffold` |
| [Deployment](docs/deployment.md) | Cloudflare Workers / Pages, secrets, cron |
| [Directory structure](docs/directory-structure.md) | What files and folders mean |
| [Troubleshooting](docs/troubleshooting.md) | FAQ and common errors |

## Contributing

```bash
pnpm install
pnpm --filter @ekrist1/vulse test              # unit tests
pnpm --filter @ekrist1/vulse test:integration  # D1/miniflare integration tests
pnpm --filter @ekrist1/vulse typecheck
pnpm --filter @ekrist1/vulse build
```

The playground (`playground/vulse-play`) is the easiest way to exercise changes end-to-end.

## License

See [LICENSE](LICENSE) (MIT).
