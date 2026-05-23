import type { Auth } from '../../src/server/better-auth'

export async function signUp(
  auth: Auth,
  email: string,
  password: string,
  name: string,
): Promise<Response> {
  return auth.handler(new Request('http://localhost/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  }))
}

export async function signIn(auth: Auth, email: string, password: string): Promise<Response> {
  return auth.handler(new Request('http://localhost/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }))
}

export function cookieFromResponse(res: Response): string {
  return res.headers.get('set-cookie') ?? ''
}

export async function signUpAsAdmin(env: { DB: D1Database }, auth: Auth, email = 'admin@x.com'): Promise<string> {
  await signUp(auth, email, 'password123', 'Admin')
  await env.DB.prepare(`UPDATE user SET role = 'admin' WHERE email = ?`).bind(email).run()
  const res = await signIn(auth, email, 'password123')
  return cookieFromResponse(res)
}
