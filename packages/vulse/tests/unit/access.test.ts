import { describe, it, expect } from 'vitest'
import { evaluate } from '../../src/core/access'
import { defineCollection, z } from '../../src/core/blueprints/define'

const bp = defineCollection({
  name: 'post', label: 'Post', schema: z.object({}), admin: { titleField: 't' },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user, entry }) => user?.role === 'admin' || entry?.createdBy === user?.id,
    delete: ({ user }) => user?.role === 'admin',
  },
})

describe('access.evaluate', () => {
  it('allows public read of published entries', async () => {
    expect(await evaluate(bp, 'read', { user: null, entry: { id: 'x', status: 'published', createdBy: null, content: {} } })).toBe(true)
  })
  it('denies public read of drafts', async () => {
    expect(await evaluate(bp, 'read', { user: null, entry: { id: 'x', status: 'draft', createdBy: null, content: {} } })).toBe(false)
  })
  it('lets editors create', async () => {
    expect(await evaluate(bp, 'create', { user: { id: 'u', role: 'editor', email: 'e' } })).toBe(true)
  })
  it('lets owners update their own', async () => {
    expect(await evaluate(bp, 'update', {
      user: { id: 'u1', role: 'editor', email: 'e' },
      entry: { id: 'x', status: 'draft', createdBy: 'u1', content: {} },
    })).toBe(true)
  })
  it('defaults: missing rule → admins only', async () => {
    const noRules = defineCollection({ name: 'q', label: '', schema: z.object({}), admin: { titleField: 't' } })
    expect(await evaluate(noRules, 'create', { user: { id: 'u', role: 'editor', email: 'e' } })).toBe(false)
    expect(await evaluate(noRules, 'create', { user: { id: 'u', role: 'admin', email: 'e' } })).toBe(true)
  })
})
