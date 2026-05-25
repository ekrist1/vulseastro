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

function filePathFromModuleId(id: string): string | null {
  if (id.includes('\0')) return null
  return id.split(/[?#]/, 1)[0] ?? id
}

function stripSourcemapComment(code: string): string {
  return code.replace(/\n?\/\/[#@] sourceMappingURL=\S+/g, '')
}

export function vulseSuppressSourcemapsPlugin(): Plugin {
  return {
    name: 'vulse-suppress-sourcemaps',
    enforce: 'pre',
    load(id) {
      const filePath = filePathFromModuleId(id)
      if (!filePath || !hasBrokenSourcemap(filePath)) return
      const code = readFileSync(filePath, 'utf8')
      if (!code.includes('sourceMappingURL')) return code
      return stripSourcemapComment(code)
    },
    transform(code, id) {
      if (!hasBrokenSourcemap(id) || !code.includes('sourceMappingURL')) return
      return { code: stripSourcemapComment(code), map: null }
    },
  }
}
