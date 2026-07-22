import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { GlobalsRepo } from '../../src/core/repos/globals'

const siteGlobal = {
  handle: 'site',
  label: 'Site',
  fields: [
    { name: 'siteName', ui: { kind: 'text' as const }, optional: false },
    { name: 'tagline', ui: { kind: 'textarea' as const }, optional: true },
  ],
}

describe('globals repo', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('creates set without fields, updates value, lists public values, deletes with cascade', async () => {
    const db = createDb(env.DB)
    const globals = new GlobalsRepo(db)

    await globals.createSet({ handle: 'footer', label: 'Footer', fields: [] })
    const empty = await globals.publicValues()
    expect(empty.footer).toEqual({})

    await globals.createSet(siteGlobal)
    await globals.updateValue('site', { siteName: 'Vulse', tagline: 'Content everywhere' })

    const value = await globals.getValue('site')
    expect(value?.content.siteName).toBe('Vulse')

    const all = await globals.publicValues()
    expect(all.site?.siteName).toBe('Vulse')
    expect(all.footer).toEqual({})

    const one = await globals.publicValue('site')
    expect(one?.siteName).toBe('Vulse')

    await globals.deleteSet('site')
    expect(await globals.findSetByHandle('site')).toBeNull()
    expect(await globals.getValue('site')).toBeNull()
  })

  it('validates content against compiled schema', async () => {
    const db = createDb(env.DB)
    const globals = new GlobalsRepo(db)
    await globals.createSet(siteGlobal)

    await expect(globals.updateValue('site', { siteName: 123 })).rejects.toThrow()
  })
})
