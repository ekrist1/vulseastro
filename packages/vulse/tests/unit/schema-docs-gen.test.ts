import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCodeBlueprintsFromDisk } from '../../src/core/blueprints/load-from-disk'
import {
  collectSchemaSnapshot,
  formatAgentsMarkdown,
  formatSchemaJson,
  formatSchemaMarkdown,
  generateSchemaDocs,
  type SchemaSnapshot,
} from '../../src/integration/schema-docs-gen'

const playgroundProject = fileURLToPath(new URL('../../../../playground/vulse-play', import.meta.url))

const sampleSnapshot: SchemaSnapshot = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  source: 'code',
  warning: 'code-only warning',
  collections: [
    {
      handle: 'post',
      label: 'Blog post',
      singleton: false,
      admin: { titleField: 'title', listColumns: ['title', 'slug'] },
      preview: { path: '/post/{slug}' },
      fields: [
        { name: 'title', ui: { kind: 'text' }, optional: false },
        { name: 'cover', ui: { kind: 'asset' }, optional: true },
        {
          name: 'author',
          ui: { kind: 'entry', collections: ['author'] },
          optional: true,
        },
      ],
    },
  ],
  sets: [{ handle: 'hero', label: 'Hero', fields: [{ name: 'heading', ui: { kind: 'text' }, optional: false }] }],
  globals: [{ handle: 'site', label: 'Site', fields: [{ name: 'name', ui: { kind: 'text' }, optional: false }] }],
}

describe('loadCodeBlueprintsFromDisk', () => {
  it('loads code-defined collections', async () => {
    const blueprints = await loadCodeBlueprintsFromDisk(playgroundProject)
    expect(blueprints.length).toBeGreaterThan(0)
    expect(blueprints.some((bp) => bp.name === 'post')).toBe(true)
  })
})

describe('schema docs formatters', () => {
  it('formats markdown with collections, sets, globals, and relationships', () => {
    const md = formatSchemaMarkdown(sampleSnapshot)
    expect(md).toContain('# Vulse content schema')
    expect(md).toContain('### Blog post (`post`)')
    expect(md).toContain('`post.author` → entry in `author`')
    expect(md).toContain('### Hero (`hero`)')
    expect(md).toContain('### Site (`site`)')
    expect(md).toContain('## Frontend cookbook')
  })

  it('formats AGENTS.md with collection table and rules', () => {
    const md = formatAgentsMarkdown(sampleSnapshot)
    expect(md).toContain('# AGENTS.md — Vulse project context')
    expect(md).toContain('| `post` | Blog post | `title` | `/post/{slug}` |')
    expect(md).toContain('BlockRenderer')
    expect(md).toContain('code-only warning')
  })

  it('formats JSON envelope', () => {
    const json = JSON.parse(formatSchemaJson(sampleSnapshot))
    expect(json.version).toBe(1)
    expect(json.collections).toHaveLength(1)
    expect(json.sets).toHaveLength(1)
    expect(json.globals).toHaveLength(1)
    expect(json.warning).toBe('code-only warning')
  })
})

describe('collectSchemaSnapshot', () => {
  it('falls back to code blueprints without D1', async () => {
    const snapshot = await collectSchemaSnapshot(playgroundProject)
    expect(snapshot.source).toBe('code')
    expect(snapshot.collections.some((c) => c.handle === 'post')).toBe(true)
    expect(snapshot.sets).toEqual([])
    expect(snapshot.warning).toBeTruthy()
  })
})

describe('generateSchemaDocs', () => {
  it('does not rewrite unchanged output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vulse-schema-docs-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })

    const first = await generateSchemaDocs(cwd, sampleSnapshot)
    expect(first.changed).toHaveLength(3)

    const agentsPath = join(cwd, 'AGENTS.md')
    const firstMtime = (await stat(agentsPath)).mtimeMs
    const agentsContent = await readFile(agentsPath, 'utf8')

    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await generateSchemaDocs(cwd, sampleSnapshot)

    expect(second.changed).toEqual([])
    expect(await readFile(agentsPath, 'utf8')).toBe(agentsContent)
    expect((await stat(agentsPath)).mtimeMs).toBe(firstMtime)
  })
})

describe('generateSchemaDocs with custom docs dir', () => {
  it('writes files under the configured directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vulse-schema-docs-'))
    await writeFile(join(cwd, 'AGENTS.md'), 'placeholder\n', 'utf8')

    await generateSchemaDocs(cwd, sampleSnapshot, { docsDir: 'ai-docs' })

    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toContain('AGENTS.md — Vulse project context')
    expect(await readFile(join(cwd, 'ai-docs/vulse-schema.md'), 'utf8')).toContain('# Vulse content schema')
    expect(await readFile(join(cwd, 'ai-docs/vulse-schema.json'), 'utf8')).toContain('"version": 1')
  })
})
