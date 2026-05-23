import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInstallHook } from '../../src/integration/install-hook'

describe('runInstallHook', () => {
  let cwd: string
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'vulse-install-'))
  })

  it('patches an existing wrangler.toml without duplicating', async () => {
    await writeFile(join(cwd, 'wrangler.toml'), 'name = "x"\n', 'utf8')
    await runInstallHook(cwd)
    await runInstallHook(cwd)
    const toml = await readFile(join(cwd, 'wrangler.toml'), 'utf8')
    expect((toml.match(/\[\[d1_databases\]\]/g) ?? []).length).toBe(1)
    expect((toml.match(/\[\[r2_buckets\]\]/g) ?? []).length).toBe(1)
  })

  it('creates collections starter and content config', async () => {
    await runInstallHook(cwd)
    const starter = await readFile(join(cwd, 'src/vulse/collections/page.ts'), 'utf8')
    expect(starter).toMatch(/defineCollection/)
    const cfg = await readFile(join(cwd, 'src/content/config.ts'), 'utf8')
    expect(cfg).toMatch(/vulseLoader/)
  })

  it('preserves an existing src/content/config.ts', async () => {
    await mkdir(join(cwd, 'src/content'), { recursive: true })
    await writeFile(join(cwd, 'src/content/config.ts'), '// keep me\n', 'utf8')
    await runInstallHook(cwd)
    const cfg = await readFile(join(cwd, 'src/content/config.ts'), 'utf8')
    expect(cfg).toBe('// keep me\n')
  })
})
