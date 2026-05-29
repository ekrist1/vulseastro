import type { VulseDb } from '../../core/db.js'
import { MediaRepo } from '../../core/repos/media.js'
import { buildImageUrl, buildImageSrcset, type CfImagesConfig, type ImageTransformOptions, type Variant } from '../cf-images.js'

export function mediaSdk(db: VulseDb, cfg: CfImagesConfig) {
  const repo = new MediaRepo(db)
  return {
    /**
     * Resolve a delivery URL for a media id. Pass width/quality/format to get a
     * Cloudflare-transformed (compressed, resized) URL when transforms are enabled,
     * or a variant name when using Cloudflare Images storage. A bare id returns the
     * public route. Accepts a legacy variant string for backwards compatibility.
     */
    url: (id: string, opts: (ImageTransformOptions & { variant?: Variant | string }) | string = {}) =>
      buildImageUrl(cfg, id, typeof opts === 'string' ? { variant: opts } : opts),
    /** Build a responsive `srcset` across the given widths (null unless transforms are enabled). */
    srcset: (id: string, widths: number[], opts: ImageTransformOptions = {}) =>
      buildImageSrcset(cfg, id, widths, opts),
    findById: (id: string) => repo.findById(id),
  }
}
