import { createDb } from '../core/db.js'
import { PreviewSessionsRepo } from '../core/repos/preview-sessions.js'
import { mediaRoutes } from './routes/media.js'
import { purgeExpiredFormUploadDrafts } from './routes/form-upload.js'
import { createAuth } from './better-auth.js'

export interface CronEnv {
  DB: D1Database
  BUCKET: R2Bucket
  CF_IMAGES_ACCOUNT_HASH?: string
  CF_IMAGES_TOKEN?: string
  BETTER_AUTH_SECRET: string
}

export async function vulseScheduled(env: CronEnv): Promise<void> {
  const db = createDb(env.DB)
  const auth = await createAuth(db, {
    baseURL: 'http://localhost',
    secret: env.BETTER_AUTH_SECRET,
    allowSignUp: false,
  })
  const routes = mediaRoutes(db, auth, {
    bucket: env.BUCKET,
    cfImages: {
      ...(env.CF_IMAGES_ACCOUNT_HASH ? { accountHash: env.CF_IMAGES_ACCOUNT_HASH } : {}),
      ...(env.CF_IMAGES_TOKEN ? { token: env.CF_IMAGES_TOKEN } : {}),
    },
  })
  const mediaResult = await routes.purge()
  console.log(`[vulse-cron] purged ${mediaResult.purged} media row(s)`)

  const draftResult = await purgeExpiredFormUploadDrafts(db, env.BUCKET)
  console.log(`[vulse-cron] purged ${draftResult.purged} form upload draft(s)`)

  const previewResult = await new PreviewSessionsRepo(db).purgeExpired(new Date())
  console.log(`[vulse-cron] purged ${previewResult} preview session(s)`)
}
