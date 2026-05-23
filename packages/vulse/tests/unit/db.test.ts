import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/core/db'

describe('createDb', () => {
  it('returns a drizzle client given a D1Database-shaped binding', () => {
    const fakeD1 = { prepare: () => {}, batch: () => {}, dump: () => {}, exec: () => {} }
    const db = createDb(fakeD1 as unknown as D1Database)
    expect(db).toBeDefined()
    expect(typeof db.select).toBe('function')
  })

  it('throws if binding is missing', () => {
    expect(() => createDb(undefined as unknown as D1Database)).toThrow(/D1 binding/)
  })
})
