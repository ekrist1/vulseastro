import { describe, it, expect } from 'vitest'
import { patchWranglerToml } from '../../src/integration/wrangler-patch'

describe('patchWranglerToml', () => {
  it('adds D1 + R2 bindings to a minimal wrangler.toml', () => {
    const input = `name = "my-site"\ncompatibility_date = "2025-01-01"\n`
    const out = patchWranglerToml(input, { d1Name: 'vulse-db', r2Bucket: 'vulse-media' })
    expect(out).toMatch(/\[\[d1_databases\]\]/)
    expect(out).toMatch(/binding = "DB"/)
    expect(out).toMatch(/database_name = "vulse-db"/)
    expect(out).toMatch(/\[\[r2_buckets\]\]/)
    expect(out).toMatch(/bucket_name = "vulse-media"/)
  })

  it('is idempotent: running twice does not duplicate bindings', () => {
    const input = `name = "x"\n`
    const once = patchWranglerToml(input, { d1Name: 'vulse-db', r2Bucket: 'vulse-media' })
    const twice = patchWranglerToml(once, { d1Name: 'vulse-db', r2Bucket: 'vulse-media' })
    expect(twice).toBe(once)
  })

  it('creates the file content from scratch if input is empty', () => {
    const out = patchWranglerToml('', { d1Name: 'vulse-db', r2Bucket: 'vulse-media' })
    expect(out).toMatch(/\[\[d1_databases\]\]/)
    expect(out).toMatch(/\[\[r2_buckets\]\]/)
  })
})
