import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { blueprintToDefinition } from '../core/blueprints/code-to-definition.js'
import { loadCodeBlueprintsFromDisk } from '../core/blueprints/load-from-disk.js'
import { registryFromDb } from '../core/blueprints/load.js'
import type { FieldDefinition, FieldUi, NestedFieldDefinition } from '../core/blueprints/definition.js'
import type { Blueprint } from '../core/blueprints/types.js'
import type { SeoFieldMapping } from '../core/blueprints/seo.js'
import type { GlobalSetDefinition } from '../core/globals/definition.js'
import type { SetDefinition } from '../core/sets/definition.js'
import { createDb, type VulseDb } from '../core/db.js'
import { GlobalsRepo } from '../core/repos/globals.js'
import { listSets } from '../core/sets/service.js'
import { VULSE_PACKAGE } from '../package-name.js'

export interface CollectionSnapshot {
  handle: string
  label: string
  singleton: boolean
  tree?: boolean
  maxDepth?: number
  drafts?: boolean
  seo?: boolean
  admin: {
    titleField: string
    listColumns?: string[]
    seoMapping?: SeoFieldMapping
  }
  preview?: {
    path: string
    rootSelector?: string | undefined
    live?: boolean | undefined
  }
  fields: FieldDefinition[]
}

export interface SchemaSnapshot {
  generatedAt: string
  source: 'database' | 'code'
  warning?: string
  collections: CollectionSnapshot[]
  sets: SetDefinition[]
  globals: GlobalSetDefinition[]
}

export interface GenerateSchemaDocsOptions {
  docsDir?: string
  agentsPath?: string
}

export interface GenerateSchemaDocsResult {
  agentsPath: string
  schemaMarkdownPath: string
  schemaJsonPath: string
  changed: string[]
}

async function writeFileIfChanged(path: string, contents: string): Promise<boolean> {
  try {
    if (await readFile(path, 'utf8') === contents) return false
  } catch {
    // Missing files are written below.
  }
  await writeFile(path, contents, 'utf8')
  return true
}

function blueprintToSnapshot(bp: Blueprint): CollectionSnapshot {
  const def = bp.definition ?? blueprintToDefinition(bp)
  const admin: CollectionSnapshot['admin'] = { titleField: bp.admin.titleField }
  if (bp.admin.listColumns !== undefined) admin.listColumns = bp.admin.listColumns
  if (bp.admin.seoMapping !== undefined) admin.seoMapping = bp.admin.seoMapping

  let preview: CollectionSnapshot['preview']
  if (bp.preview) {
    preview = { path: bp.preview.path }
    if (bp.preview.rootSelector !== undefined) preview.rootSelector = bp.preview.rootSelector
    if (bp.preview.live !== undefined) preview.live = bp.preview.live
  } else if (def.preview) {
    preview = { path: def.preview.path }
    if (def.preview.rootSelector !== undefined) preview.rootSelector = def.preview.rootSelector
    if (def.preview.live !== undefined) preview.live = def.preview.live
  }

  return {
    handle: def.handle,
    label: def.label,
    singleton: def.singleton,
    ...(def.tree !== undefined ? { tree: def.tree } : {}),
    ...(def.maxDepth !== undefined ? { maxDepth: def.maxDepth } : {}),
    ...(def.drafts !== undefined ? { drafts: def.drafts } : {}),
    ...(def.seo !== undefined ? { seo: def.seo } : {}),
    admin,
    ...(preview !== undefined ? { preview } : {}),
    fields: def.fields,
  }
}

export async function collectSchemaSnapshot(projectRoot: string, db?: VulseDb): Promise<SchemaSnapshot> {
  const generatedAt = new Date().toISOString()

  if (db) {
    const reg = await registryFromDb(db, projectRoot)
    const setRows = await listSets(db)
    const globalRows = await new GlobalsRepo(db).listSets()

    return {
      generatedAt,
      source: 'database',
      collections: reg.list().map(blueprintToSnapshot).sort((a, b) => a.handle.localeCompare(b.handle)),
      sets: setRows.map(({ handle, label, fields }) => ({ handle, label, fields })),
      globals: globalRows.map((row) => row.definition),
    }
  }

  const codeBlueprints = await loadCodeBlueprintsFromDisk(projectRoot)
  return {
    generatedAt,
    source: 'code',
    warning:
      'Generated from code blueprints only. Sets and globals require D1 — run `vulse schema:export` from a project with wrangler.toml configured.',
    collections: codeBlueprints.map(blueprintToSnapshot).sort((a, b) => a.handle.localeCompare(b.handle)),
    sets: [],
    globals: [],
  }
}

function uiKindLabel(ui: FieldUi | NestedFieldDefinition['ui']): string {
  switch (ui.kind) {
    case 'relationship':
      return `relationship → ${ui.to}`
    case 'entry':
      return `entry (${ui.collections.join(', ')})`
    case 'entries':
      return `entries (${ui.collections.join(', ')})${ui.max !== undefined ? `, max ${ui.max}` : ''}`
    case 'link':
      return ui.collections?.length ? `link (${ui.collections.join(', ')})` : 'link'
    case 'blocks':
      return ui.sets?.length ? `blocks (${ui.sets.join(', ')})` : 'blocks'
    case 'select':
      return ui.multiple ? 'select (multiple)' : 'select'
    case 'grid':
      return `grid (${ui.fields.length} columns)`
    case 'replicator':
      return `replicator (${ui.sets.map((s) => s.name).join(', ')})`
    default:
      return ui.kind
  }
}

function formatFieldRow(field: FieldDefinition | NestedFieldDefinition, indent = ''): string {
  const req = field.optional ? 'optional' : 'required'
  const validation =
    field.validation?.min !== undefined || field.validation?.max !== undefined
      ? ` (${[
          field.validation.min !== undefined ? `min ${field.validation.min}` : '',
          field.validation.max !== undefined ? `max ${field.validation.max}` : '',
        ]
          .filter(Boolean)
          .join(', ')})`
      : ''
  let line = `${indent}| \`${field.name}\` | ${uiKindLabel(field.ui)} | ${req}${validation} |`
  const ui = field.ui
  if (ui.kind === 'grid') {
    const nested = ui.fields.map((f) => formatFieldRow(f, indent + '  ')).join('\n')
    line += `\n${indent}  Nested fields:\n${indent}  | Field | Type | Required |\n${indent}  |-------|------|----------|\n${nested}`
  }
  if (ui.kind === 'replicator') {
    for (const set of ui.sets) {
      line += `\n${indent}  **Set \`${set.name}\`**${set.label ? ` (${set.label})` : ''}:`
      line += `\n${indent}  | Field | Type | Required |\n${indent}  |-------|------|----------|`
      line += set.fields.map((f) => `\n${formatFieldRow(f, indent + '  ')}`).join('')
    }
  }
  return line
}

function formatCollectionSection(c: CollectionSnapshot): string {
  const flags = [
    c.singleton ? 'singleton' : null,
    c.tree ? 'tree' : null,
    c.drafts ? 'drafts' : null,
    c.seo ? 'seo' : null,
  ]
    .filter(Boolean)
    .join(', ')

  const lines = [
    `### ${c.label} (\`${c.handle}\`)`,
    '',
    ...(flags ? [`Flags: ${flags}`, ''] : []),
    `- **Title field:** \`${c.admin.titleField}\``,
    ...(c.admin.listColumns?.length ? [`- **List columns:** ${c.admin.listColumns.map((col) => `\`${col}\``).join(', ')}`] : []),
    ...(c.preview?.path ? [`- **Preview path:** \`${c.preview.path}\``] : []),
    '',
    '| Field | Type | Required |',
    '|-------|------|----------|',
    ...c.fields.map((f) => formatFieldRow(f)),
    '',
  ]
  return lines.join('\n')
}

function collectRelationships(collections: CollectionSnapshot[]): string[] {
  const edges: string[] = []
  function walkFields(fields: FieldDefinition[] | NestedFieldDefinition[], from: string) {
    for (const field of fields) {
      const ui = field.ui
      if (ui.kind === 'relationship') edges.push(`\`${from}.${field.name}\` → collection \`${ui.to}\``)
      if (ui.kind === 'entry') edges.push(`\`${from}.${field.name}\` → entry in ${ui.collections.map((c) => `\`${c}\``).join(', ')}`)
      if (ui.kind === 'entries') edges.push(`\`${from}.${field.name}\` → entries in ${ui.collections.map((c) => `\`${c}\``).join(', ')}`)
      if (ui.kind === 'link' && ui.collections?.length) {
        edges.push(`\`${from}.${field.name}\` → link to ${ui.collections.map((c) => `\`${c}\``).join(', ')}`)
      }
      if (ui.kind === 'grid') walkFields(ui.fields, from)
      if (ui.kind === 'replicator') {
        for (const set of ui.sets) walkFields(set.fields, from)
      }
    }
  }
  for (const c of collections) walkFields(c.fields, c.handle)
  return [...new Set(edges)].sort()
}

const FRONTEND_COOKBOOK = `## Frontend cookbook

### Content Layer loader (SSG)

Wire collections in \`src/content.config.ts\`:

\`\`\`ts
import { defineCollection, z } from 'astro:content'
import { vulseLoader } from '${VULSE_PACKAGE}/loader'

export const collections = {
  post: defineCollection({
    loader: vulseLoader({ collection: 'post' }),
    schema: z.object({ title: z.string(), slug: z.string() }),
  }),
}
\`\`\`

Use \`getCollection()\` in pages for static archive/detail routes.

### Runtime SDK (SSR)

\`\`\`astro
---
import { getRuntimeEnv, getRuntime, createDb, registryForRequest } from '${VULSE_PACKAGE}/server'

const env = getRuntimeEnv()
const db = createDb(env.DB)
const rt = await getRuntime(env, await registryForRequest(db), Astro.url.origin)
const entry = await rt.sdk.collections.findBySlug('post', Astro.params.slug!)
---
\`\`\`

Use the SDK for filtered listings, member-only content, and live preview.

### Rendering blocks

Rich text / blocks fields render with \`BlockRenderer\`:

\`\`\`astro
---
import BlockRenderer from '${VULSE_PACKAGE}/client/BlockRenderer.astro'
---
<BlockRenderer blocks={entry.content.body ?? []} />
\`\`\`

Use \`preview.path\` from each collection when generating route files. Replace \`{slug}\` with \`Astro.params.slug\`.`


export function formatSchemaMarkdown(snapshot: SchemaSnapshot): string {
  const lines = [
    '# Vulse content schema',
    '',
    `> Generated at ${snapshot.generatedAt}. Regenerate with \`vulse schema:export\`.`,
    '',
  ]

  if (snapshot.warning) {
    lines.push(`> **Note:** ${snapshot.warning}`, '')
  }

  lines.push('## Collections', '')
  if (snapshot.collections.length === 0) {
    lines.push('_No collections defined._', '')
  } else {
    for (const c of snapshot.collections) lines.push(formatCollectionSection(c))
  }

  lines.push('## Sets (block types)', '')
  if (snapshot.sets.length === 0) {
    lines.push('_No sets defined._', '')
  } else {
    for (const set of snapshot.sets) {
      lines.push(`### ${set.label} (\`${set.handle}\`)`, '', '| Field | Type | Required |', '|-------|------|----------|')
      lines.push(...set.fields.map((f) => formatFieldRow(f)), '')
    }
  }

  lines.push('## Globals', '')
  if (snapshot.globals.length === 0) {
    lines.push('_No global sets defined._', '')
  } else {
    for (const g of snapshot.globals) {
      lines.push(`### ${g.label} (\`${g.handle}\`)`, '', '| Field | Type | Required |', '|-------|------|----------|')
      lines.push(...g.fields.map((f) => formatFieldRow(f)), '')
    }
  }

  const relationships = collectRelationships(snapshot.collections)
  lines.push('## Relationships', '')
  if (relationships.length === 0) {
    lines.push('_No cross-collection field relationships._', '')
  } else {
    lines.push(...relationships.map((e) => `- ${e}`), '')
  }

  lines.push(FRONTEND_COOKBOOK, '')
  return lines.join('\n')
}

export function formatAgentsMarkdown(snapshot: SchemaSnapshot): string {
  const lines = [
    '# AGENTS.md — Vulse project context',
    '',
    'This is an **Astro + Vulse** headless CMS project. Vulse stores content in Cloudflare D1; Astro pages read it via the Content Layer loader or runtime SDK.',
    '',
    `Schema snapshot generated at ${snapshot.generatedAt}. Regenerate after schema changes:`,
    '',
    '```bash',
    'npx vulse schema:export',
    '```',
    '',
    'Full schema reference: [`docs/vulse-schema.md`](docs/vulse-schema.md) (machine-readable: [`docs/vulse-schema.json`](docs/vulse-schema.json)).',
    '',
  ]

  if (snapshot.warning) {
    lines.push(`> **Note:** ${snapshot.warning}`, '')
  }

  lines.push('## Collections', '', '| Handle | Label | Title field | Preview path |', '|--------|-------|-------------|--------------|')
  if (snapshot.collections.length === 0) {
    lines.push('| _none_ | | | |')
  } else {
    for (const c of snapshot.collections) {
      lines.push(
        `| \`${c.handle}\` | ${c.label} | \`${c.admin.titleField}\` | \`${c.preview?.path ?? `/${c.handle}/{slug}`}\` |`,
      )
    }
  }

  lines.push(
    '',
    '## Rules for generating frontend pages',
    '',
    '1. Use each collection\'s **preview path** as the route template (`{slug}` → `Astro.params.slug`).',
    '2. Use **`admin.titleField`** for page headings and list cards.',
    '3. Render **`blocks`** fields with `BlockRenderer` from `@vulsecms/core/client/BlockRenderer.astro`.',
    '4. Use **`vulseLoader()`** + `getCollection()` for static archive pages; use the **runtime SDK** for SSR, filters, and auth-gated content.',
    '5. Respect field types: `asset` fields are media IDs (resolve via SDK/media API); `entry`/`entries`/`relationship`/`link` fields reference other collections.',
    '6. Check [`docs/vulse-schema.md`](docs/vulse-schema.md) for full field lists, sets, globals, and relationship edges before scaffolding new pages.',
    '',
  )

  return lines.join('\n')
}

export function formatSchemaJson(snapshot: SchemaSnapshot): string {
  return `${JSON.stringify(
    {
      version: 1,
      generatedAt: snapshot.generatedAt,
      source: snapshot.source,
      ...(snapshot.warning ? { warning: snapshot.warning } : {}),
      collections: snapshot.collections,
      sets: snapshot.sets,
      globals: snapshot.globals,
    },
    null,
    2,
  )}\n`
}

export async function generateSchemaDocs(
  projectRoot: string,
  snapshot: SchemaSnapshot,
  opts: GenerateSchemaDocsOptions = {},
): Promise<GenerateSchemaDocsResult> {
  const docsDir = join(projectRoot, opts.docsDir ?? 'docs')
  const agentsPath = join(projectRoot, opts.agentsPath ?? 'AGENTS.md')
  const schemaMarkdownPath = join(docsDir, 'vulse-schema.md')
  const schemaJsonPath = join(docsDir, 'vulse-schema.json')

  await mkdir(docsDir, { recursive: true })

  const agentsContent = formatAgentsMarkdown(snapshot)
  const markdownContent = formatSchemaMarkdown(snapshot)
  const jsonContent = formatSchemaJson(snapshot)

  const changed: string[] = []
  if (await writeFileIfChanged(agentsPath, agentsContent)) changed.push(agentsPath)
  if (await writeFileIfChanged(schemaMarkdownPath, markdownContent)) changed.push(schemaMarkdownPath)
  if (await writeFileIfChanged(schemaJsonPath, jsonContent)) changed.push(schemaJsonPath)

  return { agentsPath, schemaMarkdownPath, schemaJsonPath, changed }
}

export async function exportSchemaDocs(
  projectRoot: string,
  opts: GenerateSchemaDocsOptions & { db?: D1Database } = {},
): Promise<GenerateSchemaDocsResult> {
  const db = opts.db ? createDb(opts.db) : undefined
  const snapshot = await collectSchemaSnapshot(projectRoot, db)
  return generateSchemaDocs(projectRoot, snapshot, opts)
}
