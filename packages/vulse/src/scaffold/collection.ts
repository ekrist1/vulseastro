import { VULSE_PACKAGE } from '../package-name.js'

export interface ScaffoldField {
  name: string
  label?: string
  ui: { kind: string }
  /** Grid columns (nested fields). */
  fields?: ScaffoldField[]
  /** Replicator sets. */
  sets?: { name: string; label?: string; fields: ScaffoldField[] }[]
}

export interface CollectionScaffoldInput {
  handle: string
  label: string
  showRoute: string
  indexRoute?: string
  titleField?: string
  fields?: ScaffoldField[]
  /** Frontend target for the generated show page. Defaults to 'astro'. */
  framework?: 'astro' | 'vue'
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

export function pascalHandle(handle: string): string {
  return handle
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
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
    ? `\n  <BlockRenderer blocks={content.body ?? []} mediaUrl={(id) => \`/api/vulse/public/media/\${id}/file\`} />`
    : ''

  return `---
import { useCollection } from '${VULSE_PACKAGE}/server'
${blockImport}
// Reads content from D1 per request, so it must render on demand. Required when
// the project uses Astro's default \`output: 'static'\` — otherwise a dynamic
// route errors with "getStaticPaths() function is required for dynamic routes".
export const prerender = false

const slug = Astro.params.slug!
const { entry, content } = await useCollection(Astro, '${input.handle}', { slug })
if (!entry) return new Response(null, { status: 404, statusText: 'Not found' })
---
<article>
  <h1>{String(content.${titleField} ?? slug)}</h1>${blockRender}
</article>
`
}

interface FieldDescriptor {
  name: string
  label?: string
  kind: string
  fields?: FieldDescriptor[]
  sets?: { name: string; label?: string; fields: FieldDescriptor[] }[]
}

function toFieldDescriptors(fields: ScaffoldField[]): FieldDescriptor[] {
  return fields.map((f) => {
    const d: FieldDescriptor = { name: f.name, kind: f.ui.kind }
    if (f.label) d.label = f.label
    if (f.fields?.length) d.fields = toFieldDescriptors(f.fields)
    if (f.sets?.length) {
      d.sets = f.sets.map((s) => ({
        name: s.name,
        ...(s.label ? { label: s.label } : {}),
        fields: toFieldDescriptors(s.fields),
      }))
    }
    return d
  })
}

function buildFieldDescriptors(input: CollectionScaffoldInput): FieldDescriptor[] {
  const fields = input.fields ?? []
  if (fields.length > 0) return toFieldDescriptors(fields)
  // Mirror the default blueprint (title + blocks body) when no fields are known.
  return [
    { name: resolveTitleField(input), kind: 'text' },
    { name: 'body', kind: 'blocks' },
  ]
}

/** Relative path from the show page back to src/components/<Component>.vue. */
function componentImportPath(segment: string, component: string): string {
  // src/pages/[slug].astro -> depth 1; src/pages/<segment>/[slug].astro -> depth 2+
  const depth = 1 + (segment ? segment.split('/').filter(Boolean).length : 0)
  return `${'../'.repeat(depth)}components/${component}.vue`
}

export function generateVueComponent(input: CollectionScaffoldInput): string {
  const titleField = resolveTitleField(input)
  const descriptor = JSON.stringify(buildFieldDescriptors(input), null, 2)

  return `<script setup lang="ts">
import EntryRenderer from '${VULSE_PACKAGE}/client/EntryRenderer.vue'

// Generated starting point — customize freely.
const props = defineProps<{
  content: Record<string, unknown>
  mediaBase?: string
}>()

// Field kinds captured from the blueprint at scaffold time so rendering is
// unambiguous (asset vs text, grid vs replicator). Edit to taste.
const fields = ${descriptor}
</script>

<template>
  <EntryRenderer
    :content="props.content"
    :fields="fields"
    :mediaBase="props.mediaBase"
    titleField="${titleField}"
  />
</template>
`
}

export function generateVueShowPage(input: CollectionScaffoldInput): string {
  const component = `${pascalHandle(input.handle)}Entry`
  const segment = deriveUrlSegment(input.showRoute, input.indexRoute)
  const importPath = componentImportPath(segment, component)

  return `---
import { useCollection } from '${VULSE_PACKAGE}/server'
import ${component} from '${importPath}'

// Reads content from D1 per request, so it must render on demand. Required when
// the project uses Astro's default \`output: 'static'\` — otherwise a dynamic
// route errors with "getStaticPaths() function is required for dynamic routes".
export const prerender = false

const slug = Astro.params.slug!
const { entry, content } = await useCollection(Astro, '${input.handle}', { slug })
if (!entry) return new Response(null, { status: 404, statusText: 'Not found' })
---
<${component} client:load content={content} mediaBase="/api/vulse/public/media" />
`
}

export function generateIndexPage(input: CollectionScaffoldInput): string | null {
  const indexRoute = input.indexRoute?.trim()
  if (!indexRoute || indexRoute === '/') return null

  const titleField = resolveTitleField(input)
  const segment = deriveUrlSegment(input.showRoute, input.indexRoute)
  const hrefPrefix = segment ? `/${segment}` : ''

  return `---
import { useCollection } from '${VULSE_PACKAGE}/server'

export const prerender = false

const { entries: rows } = await useCollection(Astro, '${input.handle}')

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
  if (input.framework === 'vue') parts.push('--framework vue')
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

  const isVue = input.framework === 'vue'
  const segment = deriveUrlSegment(input.showRoute, input.indexRoute)
  const showPath = segment ? `src/pages/${segment}/[slug].astro` : 'src/pages/[slug].astro'
  const files: ScaffoldFile[] = []

  if (includeBlueprint) {
    files.push({
      path: `src/vulse/collections/${input.handle}.ts`,
      content: generateCodeBlueprint(input),
    })
  }

  files.push({
    path: showPath,
    content: isVue ? generateVueShowPage(input) : generateShowPage(input),
  })

  if (isVue) {
    files.push({
      path: `src/components/${pascalHandle(input.handle)}Entry.vue`,
      content: generateVueComponent(input),
    })
  }

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
