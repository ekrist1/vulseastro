// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import vulse from '@vulsecms/core/integration';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [vulse()],
});
