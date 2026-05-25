import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateBlueprintTypes } from '../../src/integration/type-gen'

describe('generateBlueprintTypes', () => {
  it('does not rewrite unchanged output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vulse-type-gen-'))
    await mkdir(join(cwd, 'src/vulse/collections'), { recursive: true })
    await writeFile(join(cwd, 'src/vulse/collections/page.ts'), 'export default {}\n', 'utf8')

    await generateBlueprintTypes(cwd)
    const outputPath = join(cwd, '.vulse/types.d.ts')
    const first = await stat(outputPath)
    const output = await readFile(outputPath, 'utf8')

    await new Promise((resolve) => setTimeout(resolve, 20))
    await generateBlueprintTypes(cwd)

    expect(await readFile(outputPath, 'utf8')).toBe(output)
    expect((await stat(outputPath)).mtimeMs).toBe(first.mtimeMs)
  })
})
