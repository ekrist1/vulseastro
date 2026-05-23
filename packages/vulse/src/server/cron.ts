import { createDb } from '../core/db.js'
import { mediaRoutes } from './routes/media.js'
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
  const result = await routes.purge()
  console.log(`[vulse-cron] purged ${result.purged} media row(s)`)
}
