const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeSlug(input: string): string {
  return input
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function isValidSlug(input: string): boolean {
  return VALID_SLUG.test(input)
}

const VALID_FIELD_HANDLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function normalizeFieldHandle(input: string): string {
  return input
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .replace(/^[^a-z_]+/, '')
}

export function isValidFieldHandle(input: string): boolean {
  return VALID_FIELD_HANDLE.test(input)
}
