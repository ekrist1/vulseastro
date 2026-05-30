import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { THEMES } from '../../src/core/themes/themes.generated'
import { writeTheme } from '../../src/scaffold/theme-write'

describe('built-in themes', () => {
  it('ships the expected theme keys', () => {
    expect(THEMES.map((t) => t.key).sort()).toEqual(['mono'])
  })

  for (const theme of THEMES) {
    describe(`theme: ${theme.key}`, () => {
      it('has metadata', () => {
        expect(theme.name).toBeTruthy()
        expect(theme.description).toBeTruthy()
        expect(theme.files.length).toBeGreaterThan(0)
      })

      it('ships a Tailwind v4 token stylesheet', () => {
        const css = theme.files.find((f) => f.path === 'src/styles/theme.css')
        expect(css, 'theme.css is required').toBeTruthy()
        expect(css!.content).toContain('@import "tailwindcss"')
        expect(css!.content).toContain('@theme')
        // Guards the dev full-reload fix documented in the plan.
        expect(css!.content).toContain('@source not')
      })

      it('ships at least one section component', () => {
        const sections = theme.files.filter(
          (f) => f.path.startsWith('src/components/sections/') && f.path.endsWith('.astro'),
        )
        expect(sections.length).toBeGreaterThan(0)
      })

      it('uses project-relative POSIX paths with no traversal', () => {
        for (const f of theme.files) {
          expect(f.path.startsWith('/'), `${f.path} must be relative`).toBe(false)
          expect(f.path.includes('\\'), `${f.path} must use POSIX separators`).toBe(false)
          expect(f.path.split('/').includes('..'), `${f.path} must not traverse`).toBe(false)
        }
      })

      it('has no duplicate file paths', () => {
        const paths = theme.files.map((f) => f.path)
        expect(new Set(paths).size).toBe(paths.length)
      })

      it('has non-empty content for every file', () => {
        for (const f of theme.files) {
          expect(f.content.length, `${f.path} should not be empty`).toBeGreaterThan(0)
        }
      })
    })
  }
})

describe('writeTheme', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'vulse-theme-'))
  })

  it('writes files and skips existing ones unless forced', async () => {
    const first = await writeTheme(cwd, 'mono')
    expect(first.written).toContain('src/styles/theme.css')
    expect(first.skipped).toEqual([])

    const second = await writeTheme(cwd, 'mono')
    expect(second.written).toEqual([])
    expect(second.skipped).toContain('src/styles/theme.css')

    const forced = await writeTheme(cwd, 'mono', { force: true })
    expect(forced.written).toContain('src/styles/theme.css')
  })

  it('installs under a relative --dir', async () => {
    await writeTheme(cwd, 'mono', { dir: 'apps/site' })
    await expect(access(join(cwd, 'apps/site/src/styles/theme.css'))).resolves.toBeUndefined()
  })

  it('rejects an absolute --dir', async () => {
    await expect(writeTheme(cwd, 'mono', { dir: '/etc' })).rejects.toThrow(/Invalid --dir/)
  })

  it('rejects a --dir that escapes the project with ..', async () => {
    await expect(writeTheme(cwd, 'mono', { dir: '../escape' })).rejects.toThrow(/Invalid --dir/)
  })

  it('throws on an unknown theme', async () => {
    await expect(writeTheme(cwd, 'nope')).rejects.toThrow(/Unknown theme/)
  })
})
