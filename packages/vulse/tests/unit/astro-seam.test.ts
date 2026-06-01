import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/vulse root (two levels up from tests/unit/).
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) out.push(...walk(abs))
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(abs)
  }
  return out
}

/** Module specifiers from `import … from '…'`, bare `import '…'`, and `import('…')`. */
function importedSpecifiers(source: string): string[] {
  const specs: string[] = []
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) specs.push(m[1]!)
  return specs
}

function isAstroSpecifier(spec: string): boolean {
  return /^(astro($|\/|:)|@astrojs\/)/.test(spec)
}

// The framework-agnostic core + request/runtime layer. These MUST NOT import Astro.
const PORTABLE_CORE = [
  'src/core',
  'src/server/routes',
  'src/server/handler.ts',
  'src/server/runtime.ts',
]

function collectFiles(entry: string): string[] {
  const abs = join(pkgRoot, entry)
  return statSync(abs).isDirectory() ? walk(abs) : [abs]
}

describe('Astro seam', () => {
  it('the portable core imports zero Astro', () => {
    const offenders: string[] = []
    for (const entry of PORTABLE_CORE) {
      for (const file of collectFiles(entry)) {
        const bad = importedSpecifiers(readFileSync(file, 'utf8')).filter(isAstroSpecifier)
        if (bad.length) offenders.push(`${relative(pkgRoot, file)} -> ${[...new Set(bad)].join(', ')}`)
      }
    }
    expect(offenders, `Astro imports leaked into the core:\n${offenders.join('\n')}`).toEqual([])
  })

  it('astro/loaders is imported only by src/server/loader.ts', () => {
    const importers = walk(join(pkgRoot, 'src'))
      .filter((f) => importedSpecifiers(readFileSync(f, 'utf8')).includes('astro/loaders'))
      .map((f) => relative(pkgRoot, f).replace(/\\/g, '/'))
      .sort()
    expect(importers).toEqual(['src/server/loader.ts'])
  })

  it('no source file imports zod via astro/zod (use the zod package directly)', () => {
    const offenders = walk(join(pkgRoot, 'src'))
      .filter((f) => importedSpecifiers(readFileSync(f, 'utf8')).includes('astro/zod'))
      .map((f) => relative(pkgRoot, f).replace(/\\/g, '/'))
    expect(offenders).toEqual([])
  })
})
