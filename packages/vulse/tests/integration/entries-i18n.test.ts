import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'

describe('EntriesRepo i18n', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('creates an entry in a non-default locale and lists locales', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const created = await repo.create({
      collection: 'post', locale: 'en', slug: 'hello',
      content: { title: 'Hello' }, createdBy: 'u1',
    })
    expect(created.locale).toBe('en')
    expect(created.slug).toBe('hello')

    const locales = await repo.listLocales(created.id)
    expect(locales).toHaveLength(1)
    expect(locales[0]!.locale).toBe('en')
  })

  it('allows the same slug in different locales without collision', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const en = await repo.create({
      collection: 'post', locale: 'en', slug: 'shared',
      content: { title: 'EN' }, createdBy: 'u1',
    })
    const fr = await repo.create({
      collection: 'post', locale: 'fr', slug: 'shared',
      content: { title: 'FR' }, createdBy: 'u1',
    })
    expect(en.slug).toBe('shared')
    expect(fr.slug).toBe('shared')
    expect(en.id).not.toBe(fr.id)
  })

  it('appends an additional locale to an existing entry via createLocale', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const en = await repo.create({
      collection: 'post', locale: 'en', slug: 'two-locales',
      content: { title: 'EN' }, createdBy: 'u1',
    })
    const fr = await repo.createLocale(en.id, {
      locale: 'fr', slug: 'deux-locales', content: { title: 'FR' }, updatedBy: 'u1',
    })
    expect(fr.id).toBe(en.id)
    expect(fr.locale).toBe('fr')
    expect(fr.slug).toBe('deux-locales')

    const locales = await repo.listLocales(en.id)
    expect(locales.map((l) => l.locale).sort()).toEqual(['en', 'fr'])
  })

  it('uses publish, not status alone, when creating a drafts-enabled locale', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const draftBase = await repo.create({
      collection: 'post', locale: 'en', slug: 'draft-base',
      content: { title: 'EN' }, createdBy: 'u1',
    })
    const draftFr = await repo.createLocale(draftBase.id, {
      locale: 'fr',
      slug: 'draft-fr',
      content: { title: 'FR draft' },
      updatedBy: 'u1',
      status: 'published',
      draftsEnabled: true,
    })
    expect(draftFr.status).toBe('draft')
    expect(draftFr.content).toEqual({})
    expect(draftFr.draftContent).toEqual({ title: 'FR draft' })

    const publishedBase = await repo.create({
      collection: 'post', locale: 'en', slug: 'published-base',
      content: { title: 'EN' }, createdBy: 'u1',
    })
    const publishedFr = await repo.createLocale(publishedBase.id, {
      locale: 'fr',
      slug: 'published-fr',
      content: { title: 'FR published' },
      updatedBy: 'u1',
      publish: true,
      draftsEnabled: true,
    })
    expect(publishedFr.status).toBe('published')
    expect(publishedFr.content).toEqual({ title: 'FR published' })
    expect(publishedFr.draftContent).toBeNull()
  })

  it('list returns only rows for the requested locale', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a = await repo.create({ collection: 'post', locale: 'en', slug: 'a', content: { title: 'A' }, createdBy: 'u1' })
    await repo.create({ collection: 'post', locale: 'en', slug: 'b', content: { title: 'B' }, createdBy: 'u1' })
    await repo.createLocale(a.id, { locale: 'fr', slug: 'le-a', content: { title: 'LE A' }, updatedBy: 'u1' })

    const en = await repo.list({ collection: 'post', locale: 'en' })
    expect(en.map((r) => r.slug).sort()).toEqual(['a', 'b'])

    const fr = await repo.list({ collection: 'post', locale: 'fr' })
    expect(fr.map((r) => r.slug)).toEqual(['le-a'])
  })

  it('updateWithRevision targets a single locale row', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a = await repo.create({ collection: 'post', locale: 'en', slug: 'x', content: { title: 'A' }, createdBy: 'u1' })
    await repo.createLocale(a.id, { locale: 'fr', slug: 'fx', content: { title: 'FA' }, updatedBy: 'u1' })
    await repo.updateWithRevision(a.id, { locale: 'fr', content: { title: 'FB' }, updatedBy: 'u1' })

    const en = await repo.findById(a.id, 'en')
    const fr = await repo.findById(a.id, 'fr')
    expect((en!.content as { title: string }).title).toBe('A')
    expect((fr!.content as { title: string }).title).toBe('FB')
    expect(fr!.version).toBe(2)
    expect(en!.version).toBe(1)
  })

  it('deleting one locale leaves the entry shell intact if others remain', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a = await repo.create({ collection: 'post', locale: 'en', slug: 'k', content: {}, createdBy: 'u1' })
    await repo.createLocale(a.id, { locale: 'fr', slug: 'fk', content: {}, updatedBy: 'u1' })

    await repo.deleteLocale(a.id, 'fr')
    const remaining = await repo.listLocales(a.id)
    expect(remaining.map((r) => r.locale)).toEqual(['en'])

    const fr = await repo.findById(a.id, 'fr')
    expect(fr).toBeNull()
  })

  it('rejects move operations that would create a cycle', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const root = await repo.create({ collection: 'page', locale: 'en', slug: 'root', content: {}, createdBy: 'u1' })
    const child = await repo.create({ collection: 'page', locale: 'en', slug: 'child', content: {}, createdBy: 'u1', parentId: root.id })
    const grand = await repo.create({ collection: 'page', locale: 'en', slug: 'grand', content: {}, createdBy: 'u1', parentId: child.id })

    await expect(repo.move('page', root.id, { parentId: grand.id })).rejects.toThrow(/cannot be moved under itself/i)
    await expect(repo.move('page', root.id, { parentId: root.id })).rejects.toThrow(/cannot be moved under itself/i)
    // moving an unrelated node remains allowed
    await expect(repo.move('page', grand.id, { parentId: null })).resolves.toBeTruthy()
  })
})
