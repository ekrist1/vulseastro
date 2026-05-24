import type { PreviewConfig } from './types.js'

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
