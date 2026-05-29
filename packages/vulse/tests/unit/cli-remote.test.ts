import { describe, it, expect } from 'vitest'
import { markD1BindingRemote } from '../../src/cli/platform'

// `vulse seed:admin --remote` resolves the DB binding via getPlatformProxy. Remote
// access only happens when the binding is flagged `remote: true` in the wrangler config;
// otherwise getPlatformProxy silently uses the LOCAL miniflare D1. We patch a temp copy
// of the config to add that flag for --remote runs.
describe('markD1BindingRemote', () => {
  it('adds remote:true to the DB binding in jsonc/json', () => {
    const input = `{
  "d1_databases": [
    { "binding": "DB", "database_name": "vulse-db", "database_id": "abc-123" }
  ]
}`
    const out = markD1BindingRemote(input, false)
    expect(out).toMatch(/"binding"\s*:\s*"DB"\s*,\s*"remote"\s*:\s*true/)
    expect(out).toContain('"database_id": "abc-123"') // preserved verbatim
  })

  it('adds remote = true to the DB binding in toml', () => {
    const input = `[[d1_databases]]
binding = "DB"
database_name = "vulse-db"
database_id = "abc-123"
`
    const out = markD1BindingRemote(input, true)
    expect(out).toMatch(/binding\s*=\s*"DB"\s*\n\s*remote\s*=\s*true/)
    expect(out).toContain('database_id = "abc-123"')
  })

  it('is idempotent when the DB binding is already remote (jsonc)', () => {
    const input = `{ "d1_databases": [ { "binding": "DB", "remote": true, "database_id": "x" } ] }`
    expect(markD1BindingRemote(input, false)).toBe(input)
  })

  it('is idempotent when the DB binding is already remote (toml)', () => {
    const input = `[[d1_databases]]\nbinding = "DB"\nremote = true\n`
    expect(markD1BindingRemote(input, true)).toBe(input)
  })

  it('does not flag other bindings (e.g. R2 BUCKET)', () => {
    const input = `{
  "d1_databases": [ { "binding": "DB", "database_id": "x" } ],
  "r2_buckets": [ { "binding": "BUCKET", "bucket_name": "media" } ]
}`
    const out = markD1BindingRemote(input, false)
    expect(out).toMatch(/"binding"\s*:\s*"DB"\s*,\s*"remote"\s*:\s*true/)
    // BUCKET binding is untouched
    expect(out).toMatch(/"binding"\s*:\s*"BUCKET"\s*,\s*"bucket_name"/)
  })
})
