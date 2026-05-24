import type { PreviewDefinition } from './definition.js'
import type { PreviewConfig } from './types.js'

/** Normalize preview config for Blueprint types (`exactOptionalPropertyTypes`). */
export function toPreviewConfig(preview: PreviewDefinition | PreviewConfig): PreviewConfig {
  return {
    path: preview.path,
    ...(preview.rootSelector !== undefined ? { rootSelector: preview.rootSelector } : {}),
    ...(preview.live !== undefined ? { live: preview.live } : {}),
  }
}

/** Default public URL template for a collection's entry pages. */
export function defaultPreviewPath(collectionHandle: string): string {
  if (!collectionHandle || collectionHandle === 'page') return '/{slug}'
  return `/${collectionHandle}/{slug}`
}

export function resolvePreviewPath(bp: { name: string; preview?: PreviewConfig | null }): string {
  return bp.preview?.path ?? defaultPreviewPath(bp.name)
}

export function resolvePreviewConfig(bp: {
  name: string
  preview?: PreviewConfig | null
}): PreviewConfig {
  const path = resolvePreviewPath(bp)
  return {
    path,
    ...(bp.preview?.rootSelector ? { rootSelector: bp.preview.rootSelector } : {}),
    ...(bp.preview?.live === false ? { live: false } : {}),
  }
}
