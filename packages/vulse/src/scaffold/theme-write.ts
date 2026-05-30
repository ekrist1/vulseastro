import { access, mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { THEMES } from '../core/themes/themes.generated.js'

export interface WriteThemeOptions {
  /** Overwrite existing files instead of skipping them. */
  force?: boolean
  /** Install under a subdirectory of cwd instead of the project root. */
  dir?: string
}

export interface WriteThemeResult {
  written: string[]
  skipped: string[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Copy a theme's source files into a project. Purely additive: existing files
 * are skipped unless `force` is set. Never edits files it didn't create.
 */
export async function writeTheme(
  cwd: string,
  key: string,
  opts: WriteThemeOptions = {},
): Promise<WriteThemeResult> {
  const theme = THEMES.find((t) => t.key === key)
  if (!theme) {
    throw new Error(`Unknown theme '${key}'. Run 'vulse theme:add --list' to see options.`)
  }

  const base = opts.dir ? join(cwd, opts.dir) : cwd
  const written: string[] = []
  const skipped: string[] = []

  for (const file of theme.files) {
    const abs = join(base, file.path)
    if ((await exists(abs)) && !opts.force) {
      skipped.push(file.path)
      continue
    }
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, file.content, 'utf8')
    written.push(file.path)
  }

  return { written, skipped }
}
