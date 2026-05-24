import type { SelectOption } from './definition.js'

export function normalizeSelectOptions(options: SelectOption[]): { key: string; label: string }[] {
  return options.map((o) => (typeof o === 'string' ? { key: o, label: o } : o))
}

export function selectOptionKeys(options: SelectOption[]): [string, ...string[]] {
  const keys = normalizeSelectOptions(options).map((o) => o.key)
  if (keys.length === 0) throw new Error('Select field requires at least one option')
  return keys as [string, ...string[]]
}

/** Parse blueprint editor textarea: `key` or `key: Label` per line. */
export function parseSelectOptionsText(text: string): SelectOption[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':')
      if (colon > 0) {
        return { key: line.slice(0, colon).trim(), label: line.slice(colon + 1).trim() }
      }
      return line
    })
}

export function formatSelectOptionsText(options: SelectOption[]): string {
  return options.map((o) => (typeof o === 'string' ? o : `${o.key}: ${o.label}`)).join('\n')
}
