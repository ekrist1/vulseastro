import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { VULSE_VERSION } from '../../src/index'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
) as { version: string }

describe('package smoke test', () => {
  it('exposes a version string', () => {
    expect(VULSE_VERSION).toBe(pkg.version)
  })
})
