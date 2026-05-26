import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultScaffoldRoutes,
  deriveUrlSegment,
  generateCollectionScaffoldFiles,
  generateCodeBlueprint,
  patchContentConfig,
  scaffoldCliCommand,
} from '../../src/scaffold/collection'
import { writeCollectionScaffold } from '../../src/scaffold/collection-write'

describe('collection scaffold', () => {
  it('derives default routes', () => {
    expect(defaultScaffoldRoutes('blog')).toEqual({
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
    })
    expect(defaultScaffoldRoutes('page')).toEqual({
      showRoute: '/{slug}',
      indexRoute: '',
    })
  })

  it('derives url segment from routes', () => {
    expect(deriveUrlSegment('/blog/{slug}', '/blog')).toBe('blog')
    expect(deriveUrlSegment('/{slug}')).toBe('')
  })

  it('generates blueprint, pages, and cli command', () => {
    const input = {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
      fields: [{ name: 'title', ui: { kind: 'text' } }],
    }
    const files = generateCollectionScaffoldFiles(input, { includeContentConfig: false })
    expect(files.map((f) => f.path)).toEqual([
      'src/vulse/collections/blog.ts',
      'src/pages/blog/[slug].astro',
      'src/pages/blog/index.astro',
    ])
    expect(generateCodeBlueprint(input)).toContain("preview: { path: '/blog/{slug}' }")
    expect(scaffoldCliCommand(input)).toContain('collection:scaffold blog')
    // The show page reads D1 per request, so it must opt out of prerendering
    // or it breaks under Astro's default `output: 'static'`.
    const showPage = files.find((f) => f.path === 'src/pages/blog/[slug].astro')
    expect(showPage?.content).toContain('export const prerender = false')
    const indexPage = files.find((f) => f.path === 'src/pages/blog/index.astro')
    expect(indexPage?.content).toContain('export const prerender = false')
    expect(indexPage?.content).toContain("rt.sdk.collections.find('blog'")
    expect(indexPage?.content).not.toContain('getCollection')
  })

  it('patches content.config.ts without duplicating collection', () => {
    const existing = `import { defineCollection, z } from 'astro:content'
import { vulseLoader } from '@vulsecms/core/loader'

export const collections = {
  page: defineCollection({
    loader: vulseLoader({ collection: 'page' }),
    schema: z.object({ title: z.string() }),
  }),
}
`
    const next = patchContentConfig(existing, {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
    })
    expect(next).toContain('blog: defineCollection')
    expect((next.match(/page: defineCollection/g) ?? []).length).toBe(1)
    expect(patchContentConfig(next, {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
    })).toBe(next)
  })
})

describe('writeCollectionScaffold', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'vulse-scaffold-'))
  })

  it('writes scaffold files without patching content config by default', async () => {
    await mkdir(join(cwd, 'src'), { recursive: true })
    await writeFile(join(cwd, 'src/content.config.ts'), 'export const collections = {\n}\n', 'utf8')

    const result = await writeCollectionScaffold(cwd, {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
    })

    expect(result.written).toContain('src/vulse/collections/blog.ts')
    expect(result.written).toContain('src/pages/blog/[slug].astro')
    expect(result.patched).not.toContain('src/content.config.ts')

    const blueprint = await readFile(join(cwd, 'src/vulse/collections/blog.ts'), 'utf8')
    expect(blueprint).toContain("name: 'blog'")
    const config = await readFile(join(cwd, 'src/content.config.ts'), 'utf8')
    expect(config).not.toContain('blog: defineCollection')
  })

  it('patches content.config when static option is set', async () => {
    await mkdir(join(cwd, 'src'), { recursive: true })
    await writeFile(join(cwd, 'src/content.config.ts'), 'export const collections = {\n}\n', 'utf8')

    const result = await writeCollectionScaffold(cwd, {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
    }, { static: true })

    expect(result.patched).toContain('src/content.config.ts')
    const config = await readFile(join(cwd, 'src/content.config.ts'), 'utf8')
    expect(config).toContain('blog: defineCollection')
    expect(config).toContain('vulseLoader')
  })

  it('skips existing files unless forced', async () => {
    await mkdir(join(cwd, 'src/vulse/collections'), { recursive: true })
    await writeFile(join(cwd, 'src/vulse/collections/blog.ts'), '// keep\n', 'utf8')

    const skipped = await writeCollectionScaffold(cwd, {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
    })
    expect(skipped.skipped).toContain('src/vulse/collections/blog.ts')

    await writeCollectionScaffold(cwd, {
      handle: 'blog',
      label: 'Blog',
      showRoute: '/blog/{slug}',
      indexRoute: '/blog',
    }, { force: true })
    const blueprint = await readFile(join(cwd, 'src/vulse/collections/blog.ts'), 'utf8')
    expect(blueprint).toContain('defineCollection')
  })
})
