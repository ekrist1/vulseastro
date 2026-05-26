import { VULSE_PACKAGE } from '../package-name.js'

export interface ScaffoldField {
  name: string
  ui: { kind: string }
}

export interface CollectionScaffoldInput {
  handle: string
  label: string
  showRoute: string
  indexRoute?: string
  titleField?: string
  fields?: ScaffoldField[]
}

export interface ScaffoldFile {
  path: string
  content: string
}

export function defaultScaffoldRoutes(handle: string): { showRoute: string; indexRoute: string } {
  if (handle === 'page') {
    return { showRoute: '/{slug}', indexRoute: '' }
  }
  return { showRoute: `/${handle}/{slug}`, indexRoute: `/${handle}` }
}

export function deriveUrlSegment(showRoute: string, indexRoute?: string): string {
  const index = (indexRoute ?? '').replace(/\/$/, '')
  if (index && index !== '/') return index.replace(/^\//, '')
  const showBase = showRoute.replace(/\{slug\}/g, '').replace(/\/$/, '')
  if (!showBase || showBase === '/') return ''
  return showBase.replace(/^\//, '')
}

export function resolveTitleField(input: CollectionScaffoldInput): string {
  if (input.titleField) return input.titleField
  const fields = input.fields ?? []
  if (fields.some((f) => f.name === 'title')) return 'title'
  return fields[0]?.name ?? 'title'
}

function zodSchemaField(field: ScaffoldField): string {
  switch (field.ui.kind) {
    case 'blocks':
      return 'blocks()'
    case 'boolean':
      return 'z.boolean()'
    case 'number':
      return 'z.number()'
    case 'date':
      return 'z.coerce.date()'
    default:
      return 'z.string()'
  }
}

function contentConfigZodField(field: ScaffoldField): string {
  switch (field.ui.kind) {
    case 'blocks':
      return 'z.any().optional()'
    case 'boolean':
      return 'z.boolean().optional()'
    case 'number':
      return 'z.number().optional()'
    case 'date':
      return 'z.string().optional()'
    default:
      return 'z.string().optional()'
  }
}

function buildCodeSchemaLines(fields: ScaffoldField[]): string[] {
  const lines = fields.length > 0
    ? fields.map((f) => `    ${f.name}: ${zodSchemaField(f)},`)
    : [
      '    title: z.string().min(1),',
      '    slug: z.string(),',
      '    body: blocks(),',
    ]
  if (!lines.some((l) => l.includes('slug:'))) {
    lines.push('    slug: z.string(),')
  }
  return lines
}

function buildContentConfigSchemaLines(fields: ScaffoldField[]): string[] {
  const lines = fields.length > 0
    ? fields.map((f) => `      ${f.name}: ${contentConfigZodField(f)},`)
    : [
      '      title: z.string(),',
      '      slug: z.string(),',
      '      body: z.any().optional(),',
    ]
  if (!lines.some((l) => l.includes('slug:'))) {
    lines.push('      slug: z.string(),')
  }
  lines.push(
    '      id: z.string().optional(),',
    '      status: z.enum([\'draft\', \'published\']).optional(),',
    '      publishedAt: z.string().nullable().optional(),',
    '      updatedAt: z.string().optional(),',
  )
  return lines
}

export function generateCodeBlueprint(input: CollectionScaffoldInput): string {
  const titleField = resolveTitleField(input)
  const fields = input.fields ?? []
  const listColumns = fields.length > 0
    ? fields.slice(0, 3).map((f) => `'${f.name}'`).join(', ')
    : `'${titleField}', 'slug'`
  const schemaLines = buildCodeSchemaLines(fields).join('\n')

  return `import { defineCollection, z, blocks } from '${VULSE_PACKAGE}'

export default defineCollection({
  name: '${input.handle}',
  label: '${input.label.replace(/'/g, "\\'")}',
  schema: z.object({
${schemaLines}
  }),
  admin: { titleField: '${titleField}', listColumns: [${listColumns}] },
  preview: { path: '${input.showRoute}' },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})
`
}

export function generateShowPage(input: CollectionScaffoldInput): string {
  const titleField = resolveTitleField(input)
  const hasBlocks = (input.fields ?? []).some((f) => f.ui.kind === 'blocks')
  const blockImport = hasBlocks || (input.fields ?? []).length === 0
    ? `import BlockRenderer from '${VULSE_PACKAGE}/client/BlockRenderer.astro'\n`
    : ''
  const blockRender = hasBlocks || (input.fields ?? []).length === 0
    ? `\n  <BlockRenderer blocks={content.body ?? []} mediaUrl={(id) => \`/api/vulse/media/\${id}/file\`} />`
    : ''

  return `---
import { getRuntimeEnv, getRuntime, createDb, registryForRequest, resolvePreviewContent } from '${VULSE_PACKAGE}/server'
${blockImport}
// Reads content from D1 per request, so it must render on demand. Required when
// the project uses Astro's default \`output: 'static'\` — otherwise a dynamic
// route errors with "getStaticPaths() function is required for dynamic routes".
export const prerender = false

const slug = Astro.params.slug!
const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

const entry = await rt.sdk.collections.findBySlug('${input.handle}', slug, {
  ...(session?.user ? { audience: session.user } : {}),
})
if (!entry) return new Response(null, { status: 404, statusText: 'Not found' })

const content = resolvePreviewContent(entry, Astro.locals) as Record<string, unknown>
---
<article>
  <h1>{String(content.${titleField} ?? slug)}</h1>${blockRender}
</article>
`
}

export function generateIndexPage(input: CollectionScaffoldInput): string | null {
  const indexRoute = input.indexRoute?.trim()
  if (!indexRoute || indexRoute === '/') return null

  const titleField = resolveTitleField(input)
  const segment = deriveUrlSegment(input.showRoute, input.indexRoute)
  const hrefPrefix = segment ? `/${segment}` : ''

  return `---
import { getRuntimeEnv, getRuntime, createDb, registryForRequest } from '${VULSE_PACKAGE}/server'

export const prerender = false

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const session = await rt.auth.api.getSession({ headers: Astro.request.headers })

const rows = await rt.sdk.collections.find('${input.handle}', {
  ...(session?.user ? { audience: session.user } : {}),
})

const entries = rows.sort((a, b) =>
  String((a.content as { ${titleField}?: string }).${titleField} ?? a.slug).localeCompare(
    String((b.content as { ${titleField}?: string }).${titleField} ?? b.slug),
  ),
)
---
<section>
  <h1>${input.label.replace(/'/g, "\\'")}</h1>
  <ul>
    {entries.map((entry) => {
      const title = String((entry.content as { ${titleField}?: string }).${titleField} ?? entry.slug)
      return (
        <li>
          <a href={\`${hrefPrefix}/\${entry.slug}\`}>{title}</a>
        </li>
      )
    })}
  </ul>
</section>
`
}

export function patchContentConfig(existing: string, input: CollectionScaffoldInput): string {
  if (existing.includes(`${input.handle}:`)) return existing

  const schemaLines = buildContentConfigSchemaLines(input.fields ?? []).join('\n')
  const entry = `
  ${input.handle}: defineCollection({
    loader: vulseLoader({ collection: '${input.handle}' }),
    schema: z.object({
${schemaLines}
    }),
  }),`

  if (/export const collections = \{/.test(existing)) {
    return existing.replace(/export const collections = \{/, `export const collections = {${entry}`)
  }

  return `import { defineCollection, z } from 'astro:content'
import { vulseLoader } from '${VULSE_PACKAGE}/loader'

export const collections = {${entry}
}
`
}

export function generateContentConfig(input: CollectionScaffoldInput): string {
  return patchContentConfig('', input)
}

export function scaffoldCliCommand(
  input: CollectionScaffoldInput,
  opts: { static?: boolean } = {},
): string {
  const parts = [
    `npx vulse collection:scaffold ${input.handle}`,
    `--route '${input.showRoute}'`,
  ]
  if (input.indexRoute) parts.push(`--index '${input.indexRoute}'`)
  if (opts.static) parts.push('--static')
  if (input.label && input.label !== input.handle) {
    parts.push(`--label '${input.label.replace(/'/g, "'\\''")}'`)
  }
  const titleField = resolveTitleField(input)
  if (titleField !== 'title') parts.push(`--title-field ${titleField}`)
  return parts.join(' \\\n  ')
}

export function generateCollectionScaffoldFiles(
  input: CollectionScaffoldInput,
  opts: {
    includeBlueprint?: boolean
    includeContentConfig?: boolean
    includeIndex?: boolean
  } = {},
): ScaffoldFile[] {
  const includeBlueprint = opts.includeBlueprint ?? true
  const includeContentConfig = opts.includeContentConfig ?? false
  const includeIndex = opts.includeIndex ?? !!input.indexRoute?.trim()

  const segment = deriveUrlSegment(input.showRoute, input.indexRoute)
  const showPath = segment ? `src/pages/${segment}/[slug].astro` : 'src/pages/[slug].astro'
  const files: ScaffoldFile[] = []

  if (includeBlueprint) {
    files.push({
      path: `src/vulse/collections/${input.handle}.ts`,
      content: generateCodeBlueprint(input),
    })
  }

  files.push({ path: showPath, content: generateShowPage(input) })

  if (includeIndex) {
    const indexContent = generateIndexPage(input)
    if (indexContent) {
      const indexPath = segment ? `src/pages/${segment}/index.astro` : 'src/pages/index.astro'
      files.push({ path: indexPath, content: indexContent })
    }
  }

  if (includeContentConfig) {
    files.push({
      path: 'src/content.config.ts',
      content: generateContentConfig(input),
    })
  }

  return files
}
