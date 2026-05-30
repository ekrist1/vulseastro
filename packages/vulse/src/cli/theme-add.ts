import { THEMES } from '../core/themes/themes.generated.js'
import { writeTheme, type WriteThemeResult } from '../scaffold/theme-write.js'

export interface ThemeAddOptions {
  key?: string
  list?: boolean
  force?: boolean
  dir?: string
}

function printThemes(): void {
  console.log('\nAvailable themes:\n')
  for (const t of THEMES) {
    console.log(`  ${t.key}`)
    console.log(`    ${t.name} — ${t.description}`)
    console.log(`    files: ${t.files.length}\n`)
  }
  console.log('Install one with:  npx vulse theme:add <key>\n')
}

export async function runThemeAdd(opts: ThemeAddOptions): Promise<void> {
  if (opts.list || !opts.key) {
    printThemes()
    // No key and not an explicit --list = misuse: signal a non-zero exit.
    if (!opts.key && !opts.list) process.exitCode = 1
    return
  }

  let result: WriteThemeResult
  try {
    result = await writeTheme(process.cwd(), opts.key, {
      force: !!opts.force,
      ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
    })
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  }

  const theme = THEMES.find((t) => t.key === opts.key)!
  console.log(`\nInstalled theme "${theme.name}"`)
  if (result.written.length) {
    console.log('\nWritten:')
    for (const p of result.written) console.log(`  + ${p}`)
  }
  if (result.skipped.length) {
    console.log('\nSkipped (already exists — use --force to overwrite):')
    for (const p of result.skipped) console.log(`  - ${p}`)
  }
  console.log('\nNext steps:')
  console.log("  1. Import the stylesheet from a layout:  import '../styles/theme.css'")
  console.log('     (ThemeLayout.astro already does this.)')
  console.log('  2. Use the sections, e.g. <Hero variant="split" title="..." />')
  console.log('  3. Edit src/styles/theme.css @theme tokens to change colors/fonts/radius.')
  console.log('  4. Preview every variant at /theme-preview\n')
}
