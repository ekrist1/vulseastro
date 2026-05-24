import { sha256Hex } from '../sha256.js'
import { eq, and, lt } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulseFormRateLimits } from '../schema.js'

export async function hashIp(ip: string): Promise<string> {
  return sha256Hex(ip)
}

export async function checkRateLimit(
  db: VulseDb,
  formHandle: string,
  ipHash: string,
  opts: { maxPerIp: number; windowSec: number } = { maxPerIp: 10, windowSec: 3600 },
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const windowMs = opts.windowSec * 1000
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)

  const existing = await db.select().from(vulseFormRateLimits)
    .where(and(
      eq(vulseFormRateLimits.formHandle, formHandle),
      eq(vulseFormRateLimits.ipHash, ipHash),
      eq(vulseFormRateLimits.windowStart, windowStart),
    ))
    .get()

  if (!existing) {
    await db.insert(vulseFormRateLimits).values({
      formHandle,
      ipHash,
      windowStart,
      count: 1,
    })
    return { allowed: true }
  }

  if (existing.count >= opts.maxPerIp) {
    const retryAfterSec = Math.ceil((windowStart.getTime() + windowMs - now) / 1000)
    return { allowed: false, retryAfterSec }
  }

  await db.update(vulseFormRateLimits)
    .set({ count: existing.count + 1 })
    .where(and(
      eq(vulseFormRateLimits.formHandle, formHandle),
      eq(vulseFormRateLimits.ipHash, ipHash),
      eq(vulseFormRateLimits.windowStart, windowStart),
    ))

  return { allowed: true }
}
