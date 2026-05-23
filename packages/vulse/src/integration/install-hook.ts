import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { patchWranglerToml } from './wrangler-patch.js'

const STARTER_BLUEPRINT = `import { defineCollection, z } from 'vulse'

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

const CONTENT_CONFIG = `import { defineCollection } from 'astro:content'
import { vulseLoader } from 'vulse/loader'

export const collections = {
  page: defineCollection({ loader: vulseLoader({ collection: 'page' }) }),
}
`

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

export async function runInstallHook(cwd: string): Promise<void> {
  const wranglerPath = join(cwd, 'wrangler.toml')
  const existing = (await fileExists(wranglerPath)) ? await readFile(wranglerPath, 'utf8') : ''
  const patched = patchWranglerToml(existing, { d1Name: 'vulse-db', r2Bucket: 'vulse-media' })
  if (patched !== existing) await writeFile(wranglerPath, patched, 'utf8')

  const collectionsDir = join(cwd, 'src/vulse/collections')
  await mkdir(collectionsDir, { recursive: true })
  const starter = join(collectionsDir, 'page.ts')
  if (!(await fileExists(starter))) await writeFile(starter, STARTER_BLUEPRINT, 'utf8')

  const contentConfig = join(cwd, 'src/content/config.ts')
  if (!(await fileExists(contentConfig))) {
    await mkdir(join(cwd, 'src/content'), { recursive: true })
    await writeFile(contentConfig, CONTENT_CONFIG, 'utf8')
  }

  console.log(`
✅ Vulse installed.

One-time setup (copy/paste):
  wrangler d1 create vulse-db
  wrangler r2 bucket create vulse-media
  # Paste the returned database_id into wrangler.toml (search for TODO_PASTE_ID).
  npx vulse migrate
  npx vulse seed:admin --email you@example.com

Then: astro dev → open /admin to log in.
`)
}
