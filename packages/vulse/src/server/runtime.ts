import { createDb } from '../core/db.js'
import { createAuth } from './better-auth.js'
import { BlueprintRegistry } from '../core/blueprints/registry.js'
import { entriesRoutes } from './routes/entries.js'
import { revisionsRoutes } from './routes/revisions.js'
import { usersRoutes } from './routes/users.js'
import { settingsRoutes } from './routes/settings.js'
import { blueprintsRoutes } from './routes/blueprints.js'
import { setsRoutes } from './routes/sets.js'
import { mediaRoutes } from './routes/media.js'
import { searchRoutes } from './routes/search.js'
import { previewRoutes } from './routes/preview.js'
import { previewSessionsRoutes } from './routes/preview-sessions.js'
import { formsRoutes } from './routes/forms.js'
import { formSubmitRoutes } from './routes/form-submit.js'
import { formUploadRoutes } from './routes/form-upload.js'
import { globalsRoutes } from './routes/globals.js'
import { globalsPublicRoutes } from './routes/globals-public.js'
import { createSdk } from './sdk/index.js'
import { previewSecret } from './preview.js'
import type { Auth } from './better-auth.js'
import type { RuntimeEnv } from './env.js'

export interface VulseRuntime {
  db: ReturnType<typeof createDb>
  auth: Auth
  registry: BlueprintRegistry
  sdk: ReturnType<typeof createSdk>
  routes: {
    entries: ReturnType<typeof entriesRoutes>
    revisions: ReturnType<typeof revisionsRoutes>
    users: ReturnType<typeof usersRoutes>
    settings: ReturnType<typeof settingsRoutes>
    blueprints: ReturnType<typeof blueprintsRoutes>
    sets: ReturnType<typeof setsRoutes>
    media: ReturnType<typeof mediaRoutes>
    search: ReturnType<typeof searchRoutes>
    preview: ReturnType<typeof previewRoutes>
    previewSessions: ReturnType<typeof previewSessionsRoutes>
    forms: ReturnType<typeof formsRoutes>
    formSubmit: ReturnType<typeof formSubmitRoutes>
    formUpload: ReturnType<typeof formUploadRoutes>
    globals: ReturnType<typeof globalsRoutes>
    globalsPublic: ReturnType<typeof globalsPublicRoutes>
  }
}

let cached: VulseRuntime | null = null

export async function getRuntime(env: RuntimeEnv, registry: BlueprintRegistry, baseURL: string): Promise<VulseRuntime> {
  if (cached) return cached
  const db = createDb(env.DB)
  const auth = await createAuth(db, {
    baseURL: env.BETTER_AUTH_URL ?? baseURL,
    secret: env.BETTER_AUTH_SECRET,
  })
  if (!env.BUCKET) throw new Error('Vulse: R2 binding "BUCKET" is missing. Add it to wrangler.toml.')
  const cfImages = {
    ...(env.CF_IMAGES_ACCOUNT_HASH ? { accountHash: env.CF_IMAGES_ACCOUNT_HASH } : {}),
    ...(env.CF_IMAGES_TOKEN ? { token: env.CF_IMAGES_TOKEN } : {}),
  }
  cached = {
    db, auth, registry,
    sdk: createSdk(db, auth, registry, cfImages),
    routes: {
      entries: entriesRoutes(db, auth, registry),
      revisions: revisionsRoutes(db, auth),
      users: usersRoutes(db, auth),
      settings: settingsRoutes(db, auth),
      blueprints: blueprintsRoutes(db, auth),
      sets: setsRoutes(db, auth),
      media: mediaRoutes(db, auth, {
        bucket: env.BUCKET,
        cfImages,
      }),
      search: searchRoutes(db, auth),
      preview: previewRoutes(auth, previewSecret(env)),
      previewSessions: previewSessionsRoutes(db, auth, registry),
      forms: formsRoutes(db, auth),
      formSubmit: formSubmitRoutes(db, env.FORM_QUEUE),
      formUpload: formUploadRoutes(db, { bucket: env.BUCKET }),
      globals: globalsRoutes(db, auth),
      globalsPublic: globalsPublicRoutes(db),
    },
  }
  return cached
}

export function invalidateRuntime(): void { cached = null }

/** @deprecated use invalidateRuntime */
export function _resetRuntime(): void { invalidateRuntime() }

export type { RuntimeEnv } from './env.js'
