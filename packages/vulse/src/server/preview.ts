import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'

export async function mintPreviewToken(secret: string, userId: string, ttlSeconds = 60 * 60): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return await new SignJWT({ sub: userId, kind: 'vulse-preview' })
    .setProtectedHeader({ alg: ALG })
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key)
}

export async function verifyPreviewToken(secret: string, token: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    return payload.kind === 'vulse-preview'
  } catch {
    return false
  }
}

export function previewSecret(env: { VULSE_PREVIEW_SECRET?: string; BETTER_AUTH_SECRET: string }): string {
  return env.VULSE_PREVIEW_SECRET ?? env.BETTER_AUTH_SECRET
}
