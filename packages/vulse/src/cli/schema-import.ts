import { readFile } from 'node:fs/promises'
import { importBlueprints, SchemaBundleSchema } from '../core/blueprints/import.js'
import { SCHEMA_TEMPLATES } from '../core/blueprints/schema-templates.generated.js'

export interface SchemaImportOptions {
  file?: string
  template?: string
  list?: boolean
  remote?: boolean
  config?: string
}

function printTemplates(): void {
  console.log('\nAvailable built-in templates:\n')
  for (const t of SCHEMA_TEMPLATES) {
    console.log(`  ${t.key}`)
    console.log(`    ${t.name} — ${t.description}`)
    console.log(`    collections: ${t.handles.join(', ')}\n`)
  }
  console.log('Import one with:  npx vulse schema:import --template <key>\n')
}

export async function runSchemaImport(opts: SchemaImportOptions): Promise<void> {
  if (opts.list) {
    printTemplates()
    return
  }

  let rawBundle: unknown
  if (opts.template) {
    const template = SCHEMA_TEMPLATES.find((t) => t.key === opts.template)
    if (!template) {
      process.stderr.write(
        `Error: unknown template '${opts.template}'. Run 'vulse schema:import --list' to see options.\n`,
      )
      process.exit(1)
    }
    rawBundle = template.bundle
  } else if (opts.file) {
    let text: string
    try {
      text = await readFile(opts.file, 'utf8')
    } catch {
      process.stderr.write(`Error: could not read file '${opts.file}'.\n`)
      process.exit(1)
    }
    try {
      rawBundle = JSON.parse(text)
    } catch (err) {
      process.stderr.write(`Error: '${opts.file}' is not valid JSON: ${err instanceof Error ? err.message : err}\n`)
      process.exit(1)
    }
  } else {
    process.stderr.write('Error: provide a JSON file path or --template <key>. See --list.\n')
    process.exit(1)
  }

  const parsed = SchemaBundleSchema.safeParse(rawBundle)
  if (!parsed.success) {
    process.stderr.write('Error: bundle failed validation:\n')
    for (const issue of parsed.error.issues) {
      process.stderr.write(`  - ${issue.path.join('.')}: ${issue.message}\n`)
    }
    process.exit(1)
  }

  const { resolveCliPlatform } = await import('./platform.js')
  const { createDb } = await import('../core/db.js')
  const { db: d1, dispose } = await resolveCliPlatform({
    ...(opts.remote !== undefined ? { remote: opts.remote } : {}),
    ...(opts.config !== undefined ? { config: opts.config } : {}),
  })

  try {
    const result = await importBlueprints(createDb(d1), parsed.data)
    const label = parsed.data.name ? ` "${parsed.data.name}"` : ''
    console.log(`\nImported schema bundle${label}`)
    if (result.created.length) {
      console.log('\nCreated:')
      for (const h of result.created) console.log(`  + ${h}`)
    }
    if (result.skipped.length) {
      console.log('\nSkipped (already exists):')
      for (const h of result.skipped) console.log(`  - ${h}`)
    }
    if (result.failed.length) {
      console.log('\nFailed:')
      for (const f of result.failed) console.log(`  ! ${f.handle}: ${f.error}`)
    }
    console.log('\nNext: restart the dev server, then open Admin → Collections.\n')
    if (result.failed.length) process.exitCode = 1
  } finally {
    await dispose()
  }
}
