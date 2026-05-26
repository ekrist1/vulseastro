import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { VULSE_VERSION } from '../../src/index'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
) as { version: string }

const runtimeEntry = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/index.ts'),
  'utf8',
)

describe('package smoke test', () => {
  it('exposes a version string', () => {
    expect(VULSE_VERSION).toBe(pkg.version)
  })

  it('keeps the runtime entry free of Astro integration imports', () => {
    // dist/index.js is bundled when ssr.noExternal includes @vulsecms/core.
    // It must not reference ./integration — that pulls @tailwindcss/oxide .node binaries into SSR.
    expect(runtimeEntry).not.toMatch(/integration/)
    expect(runtimeEntry).not.toMatch(/@tailwindcss/)
  })
})
