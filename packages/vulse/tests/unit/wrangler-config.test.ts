import { describe, it, expect } from 'vitest'
import { patchWranglerJsonc, patchWranglerConfig } from '../../src/integration/wrangler-config'

/** Parse the way wrangler does: tolerate line comments and trailing commas. */
function parseJsonc(input: string): unknown {
  return JSON.parse(input.replace(/\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'))
}

describe('patchWranglerJsonc', () => {
  it('produces valid JSONC when the last property has no trailing comma', () => {
    const out = patchWranglerJsonc('{\n  "name": "w",\n  "compatibility_date": "2024-09-01"\n}', {
      d1Name: 'vulse-db',
      r2Bucket: 'vulse-media',
    })
    expect(() => parseJsonc(out)).not.toThrow()
    expect(out).toContain('"d1_databases"')
    expect(out).toContain('"r2_buckets"')
  })

  it('adds nodejs_compat when neither compatibility_flags nor compatibility_date exist', () => {
    const out = patchWranglerJsonc('{\n  "name": "w",\n  "main": "./src/index.ts"\n}')
    expect(out).toContain('nodejs_compat')
    expect(() => parseJsonc(out)).not.toThrow()
  })

  it('appends nodejs_compat to an existing compatibility_flags array', () => {
    const out = patchWranglerJsonc('{\n  "name": "w",\n  "compatibility_flags": ["x"]\n}')
    expect(parseJsonc(out)).toMatchObject({ compatibility_flags: ['x', 'nodejs_compat'] })
  })

  it('is idempotent and stays valid JSONC', () => {
    const once = patchWranglerJsonc('{\n  "name": "w",\n  "compatibility_date": "2024-09-01"\n}')
    const twice = patchWranglerJsonc(once)
    expect(twice).toBe(once)
    expect(() => parseJsonc(twice)).not.toThrow()
  })

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
    expect(out).toContain('"migrations_dir": "node_modules/@vulsecms/core/migrations"')
  })

  it('creates d1 + r2 blocks from scratch', () => {
    const out = patchWranglerJsonc('{\n  "name": "x"\n}\n')
    expect(out).toContain('"d1_databases"')
    expect(out).toContain('"migrations_dir": "node_modules/@vulsecms/core/migrations"')
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
    expect(out).toContain('migrations_dir = "node_modules/@vulsecms/core/migrations"')
  })
})
