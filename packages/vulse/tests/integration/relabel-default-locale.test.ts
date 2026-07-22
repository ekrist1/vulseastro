import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { entryRevisions } from '../../src/core/schema'

// Regression: content created on a single-locale site is stored under the 'default'
// sentinel locale. When the operator later sets a concrete default locale (e.g. 'en'),
// those rows were orphaned — the editor reads findById(id, 'en') and gets null.
// relabelSentinelLocale migrates the sentinel rows to the configured default locale.
describe('EntriesRepo.relabelSentinelLocale', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it("relabels 'default' sentinel rows (and revisions) to the new default locale", async () => {
    const db = createDb(env.DB)
    const repo = new EntriesRepo(db)
    const created = await repo.create({
      collection: 'page', slug: 'homepage', content: { title: 'Homepage' }, createdBy: 'u1',
    })
    expect(created.locale).toBe('default')
    expect(await repo.findById(created.id, 'en')).toBeNull()

    const migrated = await repo.relabelSentinelLocale('en')
    expect(migrated).toBe(1)

    const found = await repo.findById(created.id, 'en')
    expect(found?.content).toEqual({ title: 'Homepage' })
    expect(await repo.findById(created.id, 'default')).toBeNull()
    // Revision history follows the entry to the new locale (no 'default' rows left).
    const revs = await db.select({ locale: entryRevisions.locale })
      .from(entryRevisions).where(eq(entryRevisions.entryId, created.id))
    expect(revs.length).toBeGreaterThan(0)
    expect(revs.every((r) => r.locale === 'en')).toBe(true)
  })

  it("is a no-op when the new default is the 'default' sentinel itself", async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'page', slug: 'a', content: { title: 'A' }, createdBy: 'u1' })
    expect(await repo.relabelSentinelLocale('default')).toBe(0)
  })

  it('leaves concrete non-default locale rows untouched', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const fr = await repo.create({
      collection: 'page', locale: 'fr', slug: 'bonjour', content: { title: 'Bonjour' }, createdBy: 'u1',
    })
    expect(await repo.relabelSentinelLocale('en')).toBe(0)
    expect((await repo.findById(fr.id, 'fr'))?.content).toEqual({ title: 'Bonjour' })
  })

  it('skips an entry that already has a row in the new default locale (no collision)', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const entry = await repo.create({
      collection: 'page', locale: 'en', slug: 'dup', content: { title: 'EN' }, createdBy: 'u1',
    })
    // Manually add a 'default' row to the same entry to simulate legacy data.
    await repo.createLocale(entry.id, {
      locale: 'default', slug: 'dup-default', content: { title: 'DEFAULT' }, updatedBy: 'u1',
    })
    expect(await repo.relabelSentinelLocale('en')).toBe(0)
    // The pre-existing 'en' row is preserved untouched.
    expect((await repo.findById(entry.id, 'en'))?.content).toEqual({ title: 'EN' })
    expect((await repo.findById(entry.id, 'default'))?.content).toEqual({ title: 'DEFAULT' })
  })

  it('skips a sentinel row when its (collection, slug) already exists under the new default', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    // Entry A under 'en' with slug 'shared'.
    await repo.create({
      collection: 'page', locale: 'en', slug: 'shared', content: { title: 'A' }, createdBy: 'u1',
    })
    // Entry B under 'default' with the same slug — relabeling it to 'en' would collide.
    const b = await repo.create({
      collection: 'page', slug: 'shared', content: { title: 'B' }, createdBy: 'u1',
    })
    expect(await repo.relabelSentinelLocale('en')).toBe(0)
    expect((await repo.findById(b.id, 'default'))?.content).toEqual({ title: 'B' })
  })
})
