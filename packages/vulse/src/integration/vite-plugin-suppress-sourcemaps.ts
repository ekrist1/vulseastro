import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** Packages that ship broken source maps and spam Vite dev warnings. */
const BROKEN_SOURCEMAP_PACKAGES = [
  'blake3-wasm',
  '@tailwindcss/node',
  '/tsx/',
] as const

function hasBrokenSourcemap(id: string): boolean {
  return BROKEN_SOURCEMAP_PACKAGES.some((pkg) => id.includes(pkg))
}

function stripSourcemapComment(code: string): string {
  return code.replace(/\n?\/\/[#@] sourceMappingURL=\S+/g, '')
}

export function vulseSuppressSourcemapsPlugin(): Plugin {
  return {
    name: 'vulse-suppress-sourcemaps',
    enforce: 'pre',
    load(id) {
      if (!hasBrokenSourcemap(id)) return
      const code = readFileSync(id, 'utf8')
      if (!code.includes('sourceMappingURL')) return code
      return stripSourcemapComment(code)
    },
    transform(code, id) {
      if (!hasBrokenSourcemap(id) || !code.includes('sourceMappingURL')) return
      return { code: stripSourcemapComment(code), map: null }
    },
  }
}
