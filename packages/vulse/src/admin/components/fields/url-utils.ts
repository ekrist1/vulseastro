const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const MEDIA_PROTOCOLS = new Set(['http:', 'https:']);
const RELATIVE_PREFIXES = ['/', './', '../', '#', '?'];

export interface ParsedIframeCode {
  code: string;
  src: string;
  title: string;
  width?: string;
  height?: string;
  allow?: string;
  loading?: string;
  referrerpolicy?: string;
  frameborder?: string;
  allowfullscreen?: boolean;
}

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

export function sanitizeLinkHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (hasRelativePrefix(trimmed)) return trimmed;
  const parsed = tryParseUrl(trimmed);
  if (!parsed || !LINK_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.toString();
}

export function sanitizeMediaSrc(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (hasRelativePrefix(trimmed)) return trimmed;
  const parsed = tryParseUrl(trimmed);
  if (!parsed || !MEDIA_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.toString();
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = value;
  }

  return attrs;
}

export function parseIframeCode(raw: string): ParsedIframeCode | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/<iframe\b([^>]*)>(?:\s*<\/iframe>)?/i);
  if (!match) return null;

  const attrs = parseAttributes(match[1] ?? '');
  const src = sanitizeMediaSrc(attrs.src ?? '');
  if (!src) return null;

  return {
    code: trimmed,
    src,
    title: attrs.title?.trim() || 'Embedded content',
    ...(attrs.width ? { width: attrs.width } : {}),
    ...(attrs.height ? { height: attrs.height } : {}),
    ...(attrs.allow ? { allow: attrs.allow } : {}),
    ...(attrs.loading ? { loading: attrs.loading } : {}),
    ...(attrs.referrerpolicy ? { referrerpolicy: attrs.referrerpolicy } : {}),
    ...(attrs.frameborder ? { frameborder: attrs.frameborder } : {}),
    ...(Object.hasOwn(attrs, 'allowfullscreen') ? { allowfullscreen: true } : {}),
  };
}
