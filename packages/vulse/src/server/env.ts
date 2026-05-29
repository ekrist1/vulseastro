import { env as cfEnv } from 'cloudflare:workers'

export interface RuntimeEnv {
  DB: D1Database
  BUCKET?: R2Bucket
  FORM_QUEUE?: Queue
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  VULSE_PREVIEW_SECRET?: string
  /** When `"true"`, enables public sign-up (overrides DB setting). Useful for local playgrounds. */
  VULSE_ALLOW_MEMBER_SIGNUP?: string
  CF_IMAGES_ACCOUNT_HASH?: string
  CF_IMAGES_TOKEN?: string
  /** When `"true"`, serve frontend images through Cloudflare Image Transformations (`/cdn-cgi/image`, format=auto). */
  VULSE_IMAGE_TRANSFORM?: string
  EMAIL_FROM?: string
  EMAIL_API_TOKEN?: string
}

export function getRuntimeEnv(): RuntimeEnv {
  const env = cfEnv as RuntimeEnv
  if (!env.DB) throw new Error('Vulse: D1 binding "DB" is missing. Add it to wrangler.toml.')
  if (!env.BETTER_AUTH_SECRET) throw new Error('Vulse: BETTER_AUTH_SECRET missing from wrangler.toml [vars].')
  return env
}
