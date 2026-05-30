import { describe, it, expect } from 'vitest'
import { THEMES } from '../../src/core/themes/themes.generated'

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
