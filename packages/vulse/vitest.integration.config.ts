import { readFileSync } from 'node:fs'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    poolOptions: {
      workers: {
        miniflare: {
          d1Databases: ['DB'],
          r2Buckets: ['BUCKET'],
          compatibilityDate: '2025-01-01',
        },
      },
    },
  },
  plugins: [
    {
      name: 'sql-raw',
      transform(_code, id) {
        if (id.endsWith('.sql?raw')) {
          const path = id.replace(/\?raw$/, '')
          const content = readFileSync(path, 'utf8')
          return { code: `export default ${JSON.stringify(content)}`, map: null }
        }
      },
    },
  ],
})
