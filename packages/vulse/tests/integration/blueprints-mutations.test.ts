import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { createBlueprint, updateBlueprint } from '../../src/core/blueprints/mutations'

describe('blueprint mutations', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('rejects duplicate nested grid field names', async () => {
    const db = createDb(env.DB)
    await expect(createBlueprint(db, {
      handle: 'post',
      label: 'Post',
      singleton: false,
      fields: [
        {
          name: 'items',
          optional: false,
          ui: {
            kind: 'grid',
            fields: [
              { name: 'title', optional: false, ui: { kind: 'text' } },
              { name: 'title', optional: true, ui: { kind: 'textarea' } },
            ],
          },
        },
      ],
    })).rejects.toThrow(/duplicate field name/)
  })

  it('rejects rename chains that would overwrite content during migration', async () => {
    const db = createDb(env.DB)
    await createBlueprint(db, {
      handle: 'post',
      label: 'Post',
      singleton: false,
      fields: [
        { name: 'a', optional: false, ui: { kind: 'text' } },
        { name: 'b', optional: false, ui: { kind: 'text' } },
      ],
    })

    await expect(updateBlueprint(db, 'post', {
      handle: 'post',
      label: 'Post',
      singleton: false,
      fields: [
        { name: 'b', previousName: 'a', optional: false, ui: { kind: 'text' } },
        { name: 'c', previousName: 'b', optional: false, ui: { kind: 'text' } },
      ],
    })).rejects.toThrow(/Rename chains/)
  })
})
