import { describe, it, expect } from 'vitest'
import { patchWranglerJsonc, patchWranglerConfig } from '../../src/integration/wrangler-config'

describe('patchWranglerJsonc', () => {
  it('adds migrations_dir to an existing Cloudflare D1 binding', () => {
    const input = `{
  "name": "my-site",
  "compatibility_date": "2025-01-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vulse-db",
      "database_id": "abc-123"
    }
  ]
}
`
    const out = patchWranglerJsonc(input)
    expect(out).toContain('"migrations_dir": "node_modules/@ekrist1/vulse/migrations"')
  })

  it('creates d1 + r2 blocks from scratch', () => {
    const out = patchWranglerJsonc('{\n  "name": "x"\n}\n')
    expect(out).toContain('"d1_databases"')
    expect(out).toContain('"migrations_dir": "node_modules/@ekrist1/vulse/migrations"')
    expect(out).toContain('"r2_buckets"')
  })
})

describe('patchWranglerConfig', () => {
  it('adds migrations_dir to an existing toml D1 binding', () => {
    const input = `name = "x"
[[d1_databases]]
binding = "DB"
database_name = "vulse-db"
database_id = "abc"
`
    const out = patchWranglerConfig(input, 'wrangler.toml')
    expect(out).toContain('migrations_dir = "node_modules/@ekrist1/vulse/migrations"')
  })
})
