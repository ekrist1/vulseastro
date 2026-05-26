import { describe, it, expect } from 'vitest'
import {
  generateSecret,
  setDatabaseId,
  applyDevVars,
  ensureGitignored,
  parseDatabaseId,
} from '../../src/cli/setup'

describe('generateSecret', () => {
  it('returns a 64-char hex string', () => {
    const s = generateSecret()
    expect(s).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is non-deterministic', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })
})

describe('setDatabaseId', () => {
  it('replaces the install-hook placeholder', () => {
    const input = 'database_id = "TODO_PASTE_ID_FROM_WRANGLER_OUTPUT"\n'
    const out = setDatabaseId(input, 'abc-123-real-id-9999')
    expect(out).toBe('database_id = "abc-123-real-id-9999"\n')
  })

  it('replaces an existing real id', () => {
    const input = 'database_id = "old-id"\n'
    const out = setDatabaseId(input, 'new-id')
    expect(out).toBe('database_id = "new-id"\n')
  })

  it('is idempotent', () => {
    const input = 'database_id = "TODO_PASTE_ID_FROM_WRANGLER_OUTPUT"\n'
    const once = setDatabaseId(input, 'abc-123')
    const twice = setDatabaseId(once, 'abc-123')
    expect(twice).toBe(once)
  })

  it('replaces a JSONC database_id', () => {
    const input = '"database_id": "old-id",\n'
    const out = setDatabaseId(input, 'new-id')
    expect(out).toBe('"database_id": "new-id",\n')
  })
})

describe('applyDevVars', () => {
  it('appends a key to an empty file', () => {
    const out = applyDevVars('', { BETTER_AUTH_SECRET: 'abc' })
    expect(out).toBe('BETTER_AUTH_SECRET="abc"\n')
  })

  it('replaces an existing key in place', () => {
    const input = 'BETTER_AUTH_SECRET="old"\nOTHER="keep"\n'
    const out = applyDevVars(input, { BETTER_AUTH_SECRET: 'new' })
    expect(out).toBe('BETTER_AUTH_SECRET="new"\nOTHER="keep"\n')
  })

  it('preserves unrelated keys', () => {
    const input = 'KEEP_ME="hello"\n'
    const out = applyDevVars(input, { NEW_KEY: 'value' })
    expect(out).toContain('KEEP_ME="hello"')
    expect(out).toContain('NEW_KEY="value"')
  })

  it('escapes embedded double quotes', () => {
    const out = applyDevVars('', { X: 'has "quote"' })
    expect(out).toBe('X="has \\"quote\\""\n')
  })

  it('adds a trailing newline before appending if missing', () => {
    const out = applyDevVars('NO_NL=1', { NEW: 'v' })
    expect(out).toBe('NO_NL=1\nNEW="v"\n')
  })
})

describe('ensureGitignored', () => {
  it('appends .dev.vars when missing', () => {
    const out = ensureGitignored('node_modules\ndist\n')
    expect(out).toBe('node_modules\ndist\n.dev.vars\n')
  })

  it('does not duplicate an existing entry', () => {
    const input = 'node_modules\n.dev.vars\ndist\n'
    expect(ensureGitignored(input)).toBe(input)
  })

  it('handles missing trailing newline', () => {
    const out = ensureGitignored('node_modules')
    expect(out).toBe('node_modules\n.dev.vars\n')
  })

  it('creates the file content from scratch', () => {
    expect(ensureGitignored('')).toBe('.dev.vars\n')
  })
})

describe('parseDatabaseId', () => {
  it('extracts the id from wrangler d1 create JSON-like output', () => {
    const output = `
✅ Successfully created DB 'vulse-db' in region WEUR

[[d1_databases]]
binding = "DB"
database_name = "vulse-db"
database_id = "abc12345-6789-4abc-def0-123456789abc"
`
    expect(parseDatabaseId(output)).toBe('abc12345-6789-4abc-def0-123456789abc')
  })

  it('returns null when no id is present', () => {
    expect(parseDatabaseId('nothing here')).toBeNull()
  })
})
