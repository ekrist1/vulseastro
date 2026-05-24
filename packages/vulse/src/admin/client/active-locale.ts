function readUrlLocaleParam(): string | null {
  const search = (globalThis as { location?: { search?: string } }).location?.search
  if (!search) return null
  return new URLSearchParams(search).get('locale')
}

/** Resolve the active locale for admin entry editing. Prefer the URL on the client (source of truth after navigation). */
export function resolveActiveLocale(
  supportedLocales: string[] | undefined,
  entryLocale: string | undefined,
  defaultLocale: string | undefined,
): string {
  const fallback = entryLocale ?? defaultLocale ?? 'default'
  const raw = readUrlLocaleParam()
  if (raw && (supportedLocales ?? []).includes(raw)) return raw
  return fallback
}
