const DEFAULT_VARIANTS = ['thumbnail', 'card', 'hero', 'og'] as const
export type Variant = typeof DEFAULT_VARIANTS[number]

export interface CfImagesConfig {
  /** Cloudflare Images (storage product) account hash — enables imagedelivery.net URLs. */
  accountHash?: string
  token?: string
  /**
   * Enable Cloudflare Image Transformations (`/cdn-cgi/image/…`) for images served
   * from R2 through the public media route. Requires Image Resizing enabled on the
   * zone and a custom domain (it is not processed on workers.dev or in local dev).
   */
  transform?: boolean
}

/** Default JPEG/WebP/AVIF quality for transformed images — a good size/quality balance. */
const DEFAULT_QUALITY = 82

/** Target widths for the named variants, used when transforming R2-served images. */
const VARIANT_WIDTHS: Record<Variant, number> = {
  thumbnail: 160,
  card: 800,
  hero: 1600,
  og: 1200,
}

export interface ImageTransformOptions {
  width?: number
  height?: number
  /** 1–100. Defaults to 82. */
  quality?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  /** Output format. `auto` (default) serves AVIF/WebP based on the browser's Accept header. */
  format?: 'auto' | 'avif' | 'webp'
}

export function isImagesEnabled(cfg: CfImagesConfig): boolean {
  return !!cfg.accountHash
}

/** Public, cacheable route that streams the original bytes from R2 (no auth required). */
export function publicMediaPath(id: string): string {
  return `/api/vulse/public/media/${id}/file`
}

export function buildDeliveryUrl(cfg: CfImagesConfig, imageId: string, variant: Variant | string = 'card'): string | null {
  if (!cfg.accountHash) return null
  return `https://imagedelivery.net/${cfg.accountHash}/${imageId}/${variant}`
}

function transformOptionsString(opts: ImageTransformOptions): string {
  const parts = [`format=${opts.format ?? 'auto'}`, `quality=${opts.quality ?? DEFAULT_QUALITY}`, `fit=${opts.fit ?? 'scale-down'}`]
  if (opts.width) parts.push(`width=${opts.width}`)
  if (opts.height) parts.push(`height=${opts.height}`)
  return parts.join(',')
}

/**
 * Resolve the best delivery URL for a media id:
 * 1. Cloudflare Images (imagedelivery.net) when an account hash is configured.
 * 2. Cloudflare Image Transformations on the public R2 route when `transform` is enabled —
 *    `format=auto` serves compressed AVIF/WebP automatically.
 * 3. The plain public route (original bytes) otherwise.
 */
export function buildImageUrl(
  cfg: CfImagesConfig,
  id: string,
  opts: ImageTransformOptions & { variant?: Variant | string } = {},
): string {
  if (cfg.accountHash) {
    return `https://imagedelivery.net/${cfg.accountHash}/${id}/${opts.variant ?? 'card'}`
  }
  const origin = publicMediaPath(id)
  if (cfg.transform) {
    // Fall back to the named-variant width when an explicit width isn't given,
    // so existing callers like `mediaUrl(id, 'hero')` still get a sensible resize.
    const variantWidth = opts.variant && opts.variant in VARIANT_WIDTHS
      ? VARIANT_WIDTHS[opts.variant as Variant]
      : undefined
    const width = opts.width ?? variantWidth
    const resolved: ImageTransformOptions = { ...opts, ...(width !== undefined ? { width } : {}) }
    // Source path is appended without its leading slash: /cdn-cgi/image/<opts>/api/vulse/…
    return `/cdn-cgi/image/${transformOptionsString(resolved)}/${origin.replace(/^\//, '')}`
  }
  return origin
}

/**
 * Build a `srcset` string across the given widths for responsive `<img>`.
 * Only meaningful when transformations are enabled (each width is a real resize);
 * returns null otherwise so callers can omit the attribute.
 */
export function buildImageSrcset(
  cfg: CfImagesConfig,
  id: string,
  widths: number[],
  opts: ImageTransformOptions = {},
): string | null {
  if (!cfg.transform || widths.length === 0) return null
  return widths.map((w) => `${buildImageUrl(cfg, id, { ...opts, width: w })} ${w}w`).join(', ')
}

/** Called on first migration: ensures default variants exist via the CF Images API. */
export async function registerDefaultVariants(cfg: CfImagesConfig): Promise<void> {
  if (!cfg.token || !cfg.accountHash) return
  const variants = [
    { id: 'thumbnail', options: { fit: 'cover', width: 160, height: 160 } },
    { id: 'card', options: { fit: 'cover', width: 800, height: 450 } },
    { id: 'hero', options: { fit: 'scale-down', width: 1600 } },
    { id: 'og', options: { fit: 'cover', width: 1200, height: 630 } },
  ]
  for (const v of variants) {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountHash}/images/v1/variants`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(v),
    }).catch(() => {})
  }
}
