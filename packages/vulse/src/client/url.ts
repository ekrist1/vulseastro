const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const MEDIA_PROTOCOLS = new Set(['http:', 'https:']);
const RELATIVE_PREFIXES = ['/', './', '../', '#', '?'];

function hasRelativePrefix(value: string): boolean {
  return RELATIVE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function sanitizeLinkHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (hasRelativePrefix(trimmed)) return trimmed;
  const parsed = tryParseUrl(trimmed);
  if (!parsed || !LINK_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.toString();
}

export function sanitizeMediaSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (hasRelativePrefix(trimmed)) return trimmed;
  const parsed = tryParseUrl(trimmed);
  if (!parsed || !MEDIA_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.toString();
}
