import { writeCollectionScaffold } from '../scaffold/collection-write.js'
import { defaultScaffoldRoutes } from '../scaffold/collection.js'

export interface CollectionScaffoldCliOptions {
  handle: string
  route?: string
  index?: string
  label?: string
  titleField?: string
  force?: boolean
  skipBlueprint?: boolean
  skipPages?: boolean
  skipContentConfig?: boolean
  cwd?: string
}

function titleCaseHandle(handle: string): string {
  return handle
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function runCollectionScaffold(opts: CollectionScaffoldCliOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const defaults = defaultScaffoldRoutes(opts.handle)
  const showRoute = opts.route ?? defaults.showRoute
  const indexRoute = opts.index !== undefined ? opts.index : defaults.indexRoute

  const result = await writeCollectionScaffold(cwd, {
    handle: opts.handle,
    label: opts.label ?? titleCaseHandle(opts.handle),
    showRoute,
    indexRoute,
    ...(opts.titleField ? { titleField: opts.titleField } : {}),
  }, {
    ...(opts.force ? { force: true } : {}),
    ...(opts.skipBlueprint ? { skipBlueprint: true } : {}),
    ...(opts.skipPages ? { skipPages: true } : {}),
    ...(opts.skipContentConfig ? { skipContentConfig: true } : {}),
  })

  console.log(`\nScaffolded collection "${opts.handle}"`)
  if (result.written.length) {
    console.log('\nCreated:')
    for (const path of result.written) console.log(`  + ${path}`)
  }
  if (result.patched.length) {
    console.log('\nUpdated:')
    for (const path of result.patched) console.log(`  ~ ${path}`)
  }
  if (result.skipped.length) {
    console.log('\nSkipped (already exists — use --force to overwrite):')
    for (const path of result.skipped) console.log(`  - ${path}`)
  }
  console.log('\nNext: restart dev server, then create entries in Admin → Collections.\n')
}
