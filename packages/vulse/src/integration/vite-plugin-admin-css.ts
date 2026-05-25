import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import type { Plugin } from 'vite'

const PACKAGE_IMPORT = '@vulsecms/core/admin.css'

/** Absolute path to shipped admin UI sources (works from dist/integration/). */
const ADMIN_ROOT = fileURLToPath(new URL('../../src/admin', import.meta.url))
const ADMIN_CSS_PATH = join(ADMIN_ROOT, 'styles/admin.css')

function isAdminCssImport(source: string, importer?: string): boolean {
  if (source === PACKAGE_IMPORT) return true
  if (source.endsWith('/admin/styles/admin.css')) return true
  if (source === '../styles/admin.css' && importer?.includes('/admin/')) return true
  return false
}

/**
 * Resolve the admin CSS to its real on-disk path (never a virtual module).
 * A real `.css` file lets Astro inline the stylesheet into <head> during dev SSR;
 * a virtual id forces Vite's JS-based style injection, which flashes unstyled
 * content on every full-page admin navigation. Relative `@source` directives in
 * admin.css resolve correctly against this path, so no rewriting is needed.
 */
export function vulseAdminCssPlugin(): Plugin {
  return {
    name: 'vulse-admin-css',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!isAdminCssImport(source, importer)) return
      return ADMIN_CSS_PATH
    },
  }
}

/** Merge admin paths with project/workspace roots — Vite replaces defaults when fs.allow is set. */
export function vulseAdminFsAllow(projectRoot: string): string[] {
  return [
    projectRoot,
    searchForWorkspaceRoot(projectRoot),
    dirname(ADMIN_CSS_PATH),
    ADMIN_ROOT,
  ]
}
