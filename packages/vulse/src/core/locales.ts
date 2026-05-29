import type { VulseDb } from './db.js'
import { SettingsRepo } from './repos/settings.js'
import { DEFAULT_LOCALE } from './repos/entries.js'
import { ValidationError } from './errors.js'

export const LOCALES_KEY = 'locales'
export const DEFAULT_LOCALE_KEY = 'defaultLocale'

// BCP-47-ish: 2-3 letter base + optional region. Conservative, easy to extend later.
const LOCALE_CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/

export interface LocalesConfig {
  /** Ordered list of locales supported by the site. Always contains defaultLocale. */
  locales: string[]
  /** The locale used when none is specified. */
  defaultLocale: string
}

export function isValidLocaleCode(code: string): boolean {
  return code === DEFAULT_LOCALE || LOCALE_CODE_RE.test(code)
}

export async function readLocalesConfig(db: VulseDb): Promise<LocalesConfig> {
  const repo = new SettingsRepo(db)
  const [raw, def] = await Promise.all([
    repo.get<unknown>(LOCALES_KEY),
    repo.get<string>(DEFAULT_LOCALE_KEY),
  ])
  const locales = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string' && isValidLocaleCode(v))
    : []
  const defaultLocale = typeof def === 'string' && isValidLocaleCode(def) ? def : DEFAULT_LOCALE
  if (locales.length === 0) locales.push(defaultLocale)
  if (!locales.includes(defaultLocale)) locales.unshift(defaultLocale)
  return { locales, defaultLocale }
}

/** Validate a locale param against site configuration; throws if unknown. */
export async function resolveLocale(db: VulseDb, candidate: string | null | undefined): Promise<string> {
  const cfg = await readLocalesConfig(db)
  if (!candidate || candidate === DEFAULT_LOCALE) return cfg.defaultLocale
  if (!cfg.locales.includes(candidate)) {
    throw new ValidationError(`Unknown locale '${candidate}'. Supported: ${cfg.locales.join(', ')}`, {
      field: 'locale',
      supported: cfg.locales,
    })
  }
  return candidate
}
