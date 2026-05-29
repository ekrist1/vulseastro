import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { createOTP } from '@better-auth/utils/otp'
import { base32 } from '@better-auth/utils/base32'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { createAuth } from '../../src/server/better-auth'
import { signUp, signIn, cookieFromResponse } from '../helpers/auth'

const SECRET = 'a'.repeat(32)

interface EnableResponse {
  totpURI: string
  backupCodes: string[]
}

async function makeAuth() {
  await applyMigrations(env.DB)
  const db = createDb(env.DB)
  return await createAuth(db, { baseURL: 'http://localhost', secret: SECRET, allowSignUp: true })
}

// `headers.get('set-cookie')` returns just one cookie in some runtimes, but
// the two-factor flow sets several (session, two-factor, dontRememberToken).
// We need them all reassembled into a single Cookie request header.
function allCookies(res: Response): string {
  // workerd / undici both expose getSetCookie(); fall back to the joined
  // header if only that's available.
  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : [])
  return setCookies
    .map((c) => c.split(';', 1)[0]!.trim())
    .filter(Boolean)
    .join('; ')
}

// The TOTP URI carries the secret as un-padded base32 of the underlying
// random ASCII string better-auth generated. To produce a code the server
// will accept, we decode back to that string and feed it to createOTP — the
// same call signature the plugin uses internally for verification.
function extractSecret(totpURI: string): string {
  const url = new URL(totpURI)
  const base32Secret = url.searchParams.get('secret')
  if (!base32Secret) throw new Error('totpURI missing secret param')
  const padded = base32Secret + '='.repeat((8 - base32Secret.length % 8) % 8)
  const bytes = base32.decode(padded)
  return new TextDecoder().decode(bytes)
}

async function generateCurrentCode(secret: string): Promise<string> {
  return await createOTP(secret, { period: 30, digits: 6 }).totp()
}

describe('two-factor plugin', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('is off by default for new users and sign-in does not require a second step', async () => {
    const auth = await makeAuth()
    await signUp(auth, 'plain@x.com', 'password123', 'Plain')
    const res = await signIn(auth, 'plain@x.com', 'password123')
    expect(res.status).toBe(200)
    const body = await res.json() as { twoFactorRedirect?: boolean; user?: { twoFactorEnabled?: boolean } }
    expect(body.twoFactorRedirect).toBeFalsy()
    expect(body.user?.twoFactorEnabled).toBeFalsy()
  })

  it('enables 2FA after a TOTP code is verified, then challenges on next sign-in', async () => {
    const auth = await makeAuth()
    await signUp(auth, 'tfa@x.com', 'password123', 'TFA')
    const cookie = cookieFromResponse(await signIn(auth, 'tfa@x.com', 'password123'))

    // 1. Start enrollment — returns the TOTP URI and a set of backup codes.
    const enableRes = await auth.handler(new Request('http://localhost/api/auth/two-factor/enable', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
      body: JSON.stringify({ password: 'password123', issuer: 'Vulse' }),
    }))
    expect(enableRes.status, await enableRes.clone().text()).toBe(200)
    const enableBody = await enableRes.json() as EnableResponse
    expect(enableBody.totpURI).toContain('otpauth://totp/')
    expect(enableBody.backupCodes.length).toBeGreaterThan(0)

    // 2. Confirm the enrollment with the current TOTP code.
    const secret = extractSecret(enableBody.totpURI)
    const code = await generateCurrentCode(secret)
    const verifyRes = await auth.handler(new Request('http://localhost/api/auth/two-factor/verify-totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
      body: JSON.stringify({ code }),
    }))
    expect(verifyRes.status, await verifyRes.clone().text()).toBe(200)

    // 3. Next sign-in returns the 2FA redirect instead of a session.
    const challengeRes = await signIn(auth, 'tfa@x.com', 'password123')
    expect(challengeRes.status).toBe(200)
    const challengeBody = await challengeRes.json() as { twoFactorRedirect?: boolean; twoFactorMethods?: string[] }
    expect(challengeBody.twoFactorRedirect).toBe(true)
    expect(challengeBody.twoFactorMethods).toContain('totp')

    // 4. The two-factor cookie set on the challenge response carries the
    // identifier that verify-totp consumes.
    const challengeCookie = allCookies(challengeRes)
    const finishCode = await generateCurrentCode(secret)
    const finishRes = await auth.handler(new Request('http://localhost/api/auth/two-factor/verify-totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: challengeCookie, origin: 'http://localhost' },
      body: JSON.stringify({ code: finishCode }),
    }))
    expect(finishRes.status, await finishRes.clone().text()).toBe(200)
  })

  it('rejects 2FA enable without the correct password', async () => {
    const auth = await makeAuth()
    await signUp(auth, 'bad@x.com', 'password123', 'Bad')
    const cookie = cookieFromResponse(await signIn(auth, 'bad@x.com', 'password123'))
    const res = await auth.handler(new Request('http://localhost/api/auth/two-factor/enable', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
      body: JSON.stringify({ password: 'WRONG', issuer: 'Vulse' }),
    }))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('disables 2FA and removes the challenge on subsequent sign-in', async () => {
    const auth = await makeAuth()
    await signUp(auth, 'off@x.com', 'password123', 'Off')
    let cookie = cookieFromResponse(await signIn(auth, 'off@x.com', 'password123'))

    const enableRes = await auth.handler(new Request('http://localhost/api/auth/two-factor/enable', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
      body: JSON.stringify({ password: 'password123', issuer: 'Vulse' }),
    }))
    const enableBody = await enableRes.json() as EnableResponse
    const secret = extractSecret(enableBody.totpURI)
    await auth.handler(new Request('http://localhost/api/auth/two-factor/verify-totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
      body: JSON.stringify({ code: await generateCurrentCode(secret) }),
    }))

    // Confirm 2FA is now required.
    const requiredRes = await signIn(auth, 'off@x.com', 'password123')
    expect(((await requiredRes.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true)

    // Sign back in fully, then disable.
    const challengeCookies = allCookies(await signIn(auth, 'off@x.com', 'password123'))
    const finishRes = await auth.handler(new Request('http://localhost/api/auth/two-factor/verify-totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: challengeCookies, origin: 'http://localhost' },
      body: JSON.stringify({ code: await generateCurrentCode(secret) }),
    }))
    expect(finishRes.status, await finishRes.clone().text()).toBe(200)
    const sessionCookies = allCookies(finishRes) || challengeCookies

    const disableRes = await auth.handler(new Request('http://localhost/api/auth/two-factor/disable', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookies, origin: 'http://localhost' },
      body: JSON.stringify({ password: 'password123' }),
    }))
    expect(disableRes.status, await disableRes.clone().text()).toBe(200)

    const afterRes = await signIn(auth, 'off@x.com', 'password123')
    const afterBody = await afterRes.json() as { twoFactorRedirect?: boolean }
    expect(afterBody.twoFactorRedirect).toBeFalsy()
  })
})
