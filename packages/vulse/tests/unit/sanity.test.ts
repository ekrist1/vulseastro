import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { VULSE_VERSION } from '../../src/index'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
) as { version: string }

const runtimeEntry = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/index.ts'),
  'utf8',
)

describe('package smoke test', () => {
  it('exposes a version string', () => {
    expect(VULSE_VERSION).toBe(pkg.version)
  })

  it('keeps the runtime entry free of EAGER Astro integration imports', () => {
    // dist/index.js is bundled when ssr.noExternal includes @vulsecms/core. An *eager*
    // (top-level, value) import of ./integration would pull @tailwindcss/oxide .node
    // binaries into the SSR bundle. The root default export (so `astro add @vulsecms/core`
    // works) is allowed ONLY via a type-only import + a lazy dynamic import() inside the
    // hook — both erase/code-split away and never land in the eager SSR bundle.
    // Forbid static value import:  import x from './integration'  /  import { x } from './integration'
    expect(runtimeEntry).not.toMatch(/^\s*import\s+(?!type\b)[^;\n]*\bfrom\s+['"]\.\/integration/m)
    // Forbid static value re-export:  export { x } from './integration'
    expect(runtimeEntry).not.toMatch(/^\s*export\s+(?!type\b)\{[^}]*\}\s+from\s+['"]\.\/integration/m)
    // Never bundle tailwind into the runtime entry.
    expect(runtimeEntry).not.toMatch(/@tailwindcss/)
  })
})
