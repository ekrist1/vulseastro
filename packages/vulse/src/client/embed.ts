import { sanitizeMediaSrc } from './url.js';

export interface ParsedIframeAttrs {
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

export function parseIframeCode(raw: unknown): ParsedIframeAttrs | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/<iframe\b([^>]*)>(?:\s*<\/iframe>)?/i);
  if (!match) return null;

  const attrs = parseAttributes(match[1] ?? '');
  const src = sanitizeMediaSrc(attrs.src ?? '');
  if (!src) return null;

  return {
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
