import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { SettingsRepo } from '../../src/core/repos/settings'
import { readLocalesConfig, resolveLocale, isValidLocaleCode } from '../../src/core/locales'

describe('locales config', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('returns a sane default when no settings exist', async () => {
    const cfg = await readLocalesConfig(createDb(env.DB))
    expect(cfg.defaultLocale).toBe('default')
    expect(cfg.locales).toEqual(['default'])
  })

  it('reads supported locales + default locale from settings', async () => {
    const db = createDb(env.DB)
    const settings = new SettingsRepo(db)
    await settings.set('locales', ['en', 'nb-NO'])
    await settings.set('defaultLocale', 'en')
    const cfg = await readLocalesConfig(db)
    expect(cfg.defaultLocale).toBe('en')
    expect(cfg.locales).toEqual(['en', 'nb-NO'])
  })

  it('forces defaultLocale into the supported list when missing', async () => {
    const db = createDb(env.DB)
    const settings = new SettingsRepo(db)
    await settings.set('locales', ['nb-NO'])
    await settings.set('defaultLocale', 'en')
    const cfg = await readLocalesConfig(db)
    expect(cfg.defaultLocale).toBe('en')
    expect(cfg.locales[0]).toBe('en')
  })

  it('resolveLocale falls back to defaultLocale when candidate is empty', async () => {
    const cfg = await resolveLocale(createDb(env.DB), undefined)
    expect(cfg).toBe('default')
  })

  it('resolveLocale rejects unknown locales', async () => {
    await expect(resolveLocale(createDb(env.DB), 'xx-YY')).rejects.toThrow(/Unknown locale/)
  })

  it('resolveLocale maps legacy "default" to the configured default locale', async () => {
    const db = createDb(env.DB)
    const settings = new SettingsRepo(db)
    await settings.set('locales', ['en', 'nb-NO'])
    await settings.set('defaultLocale', 'en')
    await expect(resolveLocale(db, 'default')).resolves.toBe('en')
  })

  it('isValidLocaleCode accepts BCP-47 forms and "default"', () => {
    expect(isValidLocaleCode('en')).toBe(true)
    expect(isValidLocaleCode('nb-NO')).toBe(true)
    expect(isValidLocaleCode('default')).toBe(true)
    expect(isValidLocaleCode('EN')).toBe(false)
    expect(isValidLocaleCode('english')).toBe(false)
  })
})
