// @ts-check
import { defineConfig } from "astro/config";

import vulsecmsCore from "@vulsecms/core";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [vulsecmsCore()],
  // `configPath` lets a build target a specific wrangler config without copying
  // it over wrangler.toml. Dev leaves WRANGLER_CONFIG unset (auto-detects
  // wrangler.toml); production/CI sets WRANGLER_CONFIG=wrangler.production.toml.
  adapter: cloudflare(
    process.env.WRANGLER_CONFIG
      ? { configPath: process.env.WRANGLER_CONFIG }
      : {},
  ),
});
