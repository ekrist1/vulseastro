// @ts-check
import { defineConfig } from 'astro/config';
import vulse from 'vulse/integration';

// https://astro.build/config
export default defineConfig({
  integrations: [vulse()],
});
