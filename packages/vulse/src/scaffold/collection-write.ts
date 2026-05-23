import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import {
  type CollectionScaffoldInput,
  generateCollectionScaffoldFiles,
  patchContentConfig,
} from './collection.js'

export interface WriteCollectionScaffoldOptions {
  force?: boolean
  skipBlueprint?: boolean
  skipPages?: boolean
  skipContentConfig?: boolean
}

export interface WriteCollectionScaffoldResult {
  written: string[]
  skipped: string[]
  patched: string[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function writeCollectionScaffold(
  cwd: string,
  input: CollectionScaffoldInput,
  opts: WriteCollectionScaffoldOptions = {},
): Promise<WriteCollectionScaffoldResult> {
  const written: string[] = []
  const skipped: string[] = []
  const patched: string[] = []

  const files = generateCollectionScaffoldFiles(input, {
    includeBlueprint: !opts.skipBlueprint,
    includeContentConfig: false,
    includeIndex: !opts.skipPages && !!input.indexRoute?.trim(),
  }).filter((file) => !opts.skipPages || !file.path.startsWith('src/pages/'))

  for (const file of files) {
    const abs = join(cwd, file.path)
    if (await exists(abs) && !opts.force) {
      skipped.push(file.path)
      continue
    }
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, file.content, 'utf8')
    written.push(file.path)
  }

  if (!opts.skipContentConfig) {
    const configPath = join(cwd, 'src/content.config.ts')
    if (await exists(configPath)) {
      const existing = await readFile(configPath, 'utf8')
      const next = patchContentConfig(existing, input)
      if (next !== existing) {
        await writeFile(configPath, next, 'utf8')
        patched.push('src/content.config.ts')
      } else if (existing.includes(`${input.handle}:`)) {
        skipped.push('src/content.config.ts (already configured)')
      }
    } else {
      const content = generateCollectionScaffoldFiles(input, {
        includeBlueprint: false,
        includeContentConfig: true,
        includeIndex: false,
      })[0]
      if (content) {
        await mkdir(dirname(configPath), { recursive: true })
        await writeFile(configPath, content.content, 'utf8')
        written.push('src/content.config.ts')
      }
    }
  }

  return { written, skipped, patched }
}
