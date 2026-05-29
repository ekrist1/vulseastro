import type { Plugin } from 'vite'

/**
 * Build-only native deps that must never be bundled into ANY output environment
 * (SSR, prerender, or client). Tailwind's oxide engine ships a `.node` binary; if a
 * non-SSR environment — notably Astro's prerender build — tries to bundle it, rollup
 * chokes parsing the ELF binary ("Unexpected character '\u{7f}'"). The integration's
 * `ssr.external` only covers the SSR environment, so externalize these everywhere.
 */
const NATIVE_PACKAGES = [
  '@tailwindcss/oxide',
  '@tailwindcss/node',
  '@tailwindcss/vite',
  'tailwindcss',
] as const

/** True when `id` is a native build-only module that must stay external in every build. */
export function isNativeExternal(id: string): boolean {
  if (id.endsWith('.node')) return true
  return NATIVE_PACKAGES.some((pkg) => id === pkg || id.startsWith(`${pkg}/`))
}

/**
 * Externalize native build-only deps across every Vite build environment. Unlike
 * `ssr.external` (SSR only), a `resolveId` hook applies to client, SSR and prerender
 * builds alike. This only affects the build graph — the Tailwind Vite plugin still
 * compiles CSS via its own Node imports, which this does not touch.
 */
export function vulseExternalizeNativePlugin(): Plugin {
  return {
    name: 'vulse-externalize-native',
    enforce: 'pre',
    resolveId(id) {
      return isNativeExternal(id) ? { id, external: true } : null
    },
  }
}
