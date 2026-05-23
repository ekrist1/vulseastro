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
