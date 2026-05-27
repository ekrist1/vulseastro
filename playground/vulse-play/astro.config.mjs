// @ts-check
import { defineConfig } from "astro/config";

import vulsecmsCore from "@vulsecms/core";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [vulsecmsCore()],
  adapter: cloudflare(),
});
