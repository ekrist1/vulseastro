# Vulse documentation

Vulse is an Astro-native, Cloudflare-hosted headless CMS. This is the user-facing documentation.

## Get started

1. [Installation](installation.md) — prerequisites, install Vulse into your Astro project, create Cloudflare resources, seed your first admin user.
2. [Configuration](configuration.md) — `wrangler.toml` bindings, environment variables, runtime settings (locales, deploy hook, auth flags).
3. [Control panel](control-panel.md) — admin UI tour.

## Build content

- [Content modeling](content-modeling.md) — blueprints, reusable sets, replicators, globals, locales/i18n.
- [Frontend](frontend.md) — wiring Vulse into your Astro project (Content Layer loader, runtime SDK, block renderer, auth components).
- [Live preview](live-preview.md) — live editor preview and the saved-draft Preview button.
- [Forms](forms.md) — form builder, submissions, spam protection, file uploads, async processing.

## Reference

- [API reference](api-reference.md) — every `/api/vulse/*` endpoint.
- [CLI reference](cli.md) — `vulse migrate`, `vulse seed:admin`, `vulse collection:scaffold`.
- [Directory structure](directory-structure.md) — what each file and folder means in a Vulse project.

## Operate

- [Upgrading](upgrading.md) — pulling a new Vulse version and running new migrations.
- [Deployment](deployment.md) — production Cloudflare Workers / Pages deploy, secrets, cron, queues.
- [Troubleshooting](troubleshooting.md) — common errors and how to fix them.

## Where things live in this repo

```
packages/vulse/           the Vulse npm package
playground/vulse-play/    a runnable Astro project that consumes Vulse
docs/                     this directory
docs/superpowers/         internal design specs (not user-facing)
```

If you spot a gap or an error, edits to these pages are welcome.
