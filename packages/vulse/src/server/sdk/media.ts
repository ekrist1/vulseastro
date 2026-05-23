import type { VulseDb } from '../../core/db.js'
import { MediaRepo } from '../../core/repos/media.js'
import { buildDeliveryUrl, type CfImagesConfig, type Variant } from '../cf-images.js'

export function mediaSdk(db: VulseDb, cfg: CfImagesConfig) {
  const repo = new MediaRepo(db)
  return {
    url: (id: string, variant: Variant | string = 'card') => buildDeliveryUrl(cfg, id, variant),
    findById: (id: string) => repo.findById(id),
  }
}
