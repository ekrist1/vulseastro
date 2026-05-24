import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { VULSE_PACKAGE } from '../package-name.js'
import { ensureWranglerConfig, patchWranglerConfig, findWranglerConfig } from './wrangler-config.js'

const STARTER_BLUEPRINT = `import { defineCollection, z } from '${VULSE_PACKAGE}'

export default defineCollection({
  name: 'page',
  label: 'Page',
  schema: z.object({
    title: z.string().min(1),
    slug: z.string(),
    body: z.string(),
  }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
})
`

const CONTENT_CONFIG = `import { defineCollection, z } from 'astro:content'
import { vulseLoader } from '${VULSE_PACKAGE}/loader'

export const collections = {
  page: defineCollection({
    loader: vulseLoader({ collection: 'page' }),
    schema: z.object({
      title: z.string(),
      slug: z.string(),
      body: z.any().optional(),
    }),
  }),
}
`

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

export async function runInstallHook(cwd: string): Promise<void> {
  const wranglerFile = await findWranglerConfig(cwd)
  const wranglerPath = join(cwd, wranglerFile ?? 'wrangler.toml')
  const existing = (await fileExists(wranglerPath)) ? await readFile(wranglerPath, 'utf8') : ''
  const patched = patchWranglerConfig(existing, wranglerFile ?? 'wrangler.toml', { d1Name: 'vulse-db', r2Bucket: 'vulse-media' })
  if (patched !== existing) await writeFile(wranglerPath, patched, 'utf8')

  const collectionsDir = join(cwd, 'src/vulse/collections')
  await mkdir(collectionsDir, { recursive: true })
  const starter = join(collectionsDir, 'page.ts')
  if (!(await fileExists(starter))) await writeFile(starter, STARTER_BLUEPRINT, 'utf8')

  const contentConfig = join(cwd, 'src/content.config.ts')
  if (!(await fileExists(contentConfig))) {
    await writeFile(contentConfig, CONTENT_CONFIG, 'utf8')
  }

  const tsConfigPath = join(cwd, 'tsconfig.json')
  if (await fileExists(tsConfigPath)) {
    const json = JSON.parse(await readFile(tsConfigPath, 'utf8')) as { include?: string[] }
    json.include = [...new Set([...(json.include ?? []), '.vulse/types.d.ts'])]
    await writeFile(tsConfigPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  }

  console.log(`
✅ Vulse installed.

One-time setup (copy/paste):
  pnpm add @astrojs/vue vue   # required at project root for the admin UI renderer
  wrangler d1 create vulse-db
  wrangler r2 bucket create vulse-media
  # Paste the returned database_id into your wrangler config (search for TODO_PASTE_ID).
  npx vulse migrate
  npx vulse seed:admin --email you@example.com

Then: astro dev → open /admin to log in.
`)
}
