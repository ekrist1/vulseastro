import { build } from 'esbuild'
import { readdirSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Blueprint } from './types.js'

function listCollectionFiles(projectRoot: string): string[] {
  const dir = resolve(projectRoot, 'src/vulse/collections')
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort()
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

/** Load code-defined blueprints without Vite's virtual module (CLI / Node). */
export async function loadCodeBlueprintsFromDisk(projectRoot: string): Promise<Blueprint[]> {
  const files = listCollectionFiles(projectRoot)
  if (!files.length) return []

  const imports = files.map((f, i) => `import bp${i} from ${JSON.stringify(f)}`).join('\n')
  const items = files.map((_, i) => `bp${i}`).join(', ')
  const entrySource = `${imports}\nexport default [${items}]\n`

  const bundleDir = join(projectRoot, '.vulse')
  const entryPath = join(bundleDir, 'blueprints-entry.mjs')
  const outPath = join(bundleDir, 'blueprints-bundle.mjs')

  await mkdir(bundleDir, { recursive: true })
  await writeFile(entryPath, entrySource, 'utf8')

  try {
    await build({
      entryPoints: [entryPath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: outPath,
      packages: 'external',
      absWorkingDir: projectRoot,
    })
    const mod = await import(/* @vite-ignore */ `${pathToFileURL(outPath).href}?t=${Date.now()}`)
    return mod.default as Blueprint[]
  } finally {
    await rm(entryPath, { force: true })
    await rm(outPath, { force: true })
  }
}
