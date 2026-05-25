import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import { collectionsSdk } from './collections.js'
import { CollectionQuery } from './query.js'
import { mediaSdk } from './media.js'
import { searchSdk } from './search.js'
import type { CfImagesConfig } from '../cf-images.js'

export function createSdk(
  db: VulseDb,
  auth: Auth,
  registry: BlueprintRegistry,
  cfImages: CfImagesConfig,
) {
  return {
    collections: collectionsSdk(db, registry),
    query: (collection: string) => new CollectionQuery(db, registry, collection),
    media: mediaSdk(db, cfImages),
    search: searchSdk(db),
    auth: {
      session: (request: Request) => auth.api.getSession({ headers: request.headers }),
    },
  }
}

export type VulseSdk = ReturnType<typeof createSdk>
