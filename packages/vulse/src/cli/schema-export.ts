import { exportSchemaDocs } from '../integration/schema-docs-gen.js'
import { resolveCliPlatform } from './platform.js'

export interface SchemaExportOptions {
  remote?: boolean
  docsDir?: string
  config?: string
}

export async function runSchemaExport(opts: SchemaExportOptions = {}): Promise<void> {
  const projectRoot = process.cwd()
  let db: D1Database | undefined
  let dispose: (() => Promise<void>) | undefined

  try {
    const platform = await resolveCliPlatform({
      ...(opts.remote ? { remote: true } : {}),
      ...(opts.config !== undefined ? { config: opts.config } : {}),
    })
    db = platform.db
    dispose = platform.dispose
  } catch {
    console.warn('Vulse: D1 unavailable — exporting code blueprints only (sets/globals omitted).')
  }

  try {
    const result = await exportSchemaDocs(projectRoot, {
      ...(opts.docsDir !== undefined ? { docsDir: opts.docsDir } : {}),
      ...(db !== undefined ? { db } : {}),
    })

    if (result.changed.length === 0) {
      console.log('Schema docs unchanged:')
    } else {
      console.log('Schema docs updated:')
    }
    for (const path of [result.agentsPath, result.schemaMarkdownPath, result.schemaJsonPath]) {
      const marker = result.changed.includes(path) ? ' (updated)' : ''
      console.log(`  ${path}${marker}`)
    }
  } finally {
    await dispose?.()
  }
}
