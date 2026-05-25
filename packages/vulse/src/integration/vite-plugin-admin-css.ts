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
 * Normalize admin CSS imports to the package export path.
 *
 * Do not resolve to a raw absolute filesystem path — Vite/Astro turn that into broken
 * dev URLs like `http://localhost:4321/home/user/.../admin.css`, which abort module
 * loads and can trigger repeated full-page reloads in the admin UI.
 *
 * Package export resolution still yields a real on-disk CSS file (for SSR inlining and
 * Tailwind `@source` scanning when combined with `vulseAdminFsAllow`).
 */
export function vulseAdminCssPlugin(): Plugin {
  return {
    name: 'vulse-admin-css',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!isAdminCssImport(source, importer)) return
      const resolved = await this.resolve(PACKAGE_IMPORT, importer, { skipSelf: true })
      return resolved?.id ?? PACKAGE_IMPORT
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
