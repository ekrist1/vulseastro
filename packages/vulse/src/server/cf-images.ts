const DEFAULT_VARIANTS = ['thumbnail', 'card', 'hero', 'og'] as const
export type Variant = typeof DEFAULT_VARIANTS[number]

export interface CfImagesConfig {
  accountHash?: string
  token?: string
}

export function isImagesEnabled(cfg: CfImagesConfig): boolean {
  return !!cfg.accountHash
}

export function buildDeliveryUrl(cfg: CfImagesConfig, imageId: string, variant: Variant | string = 'card'): string | null {
  if (!cfg.accountHash) return null
  return `https://imagedelivery.net/${cfg.accountHash}/${imageId}/${variant}`
}
