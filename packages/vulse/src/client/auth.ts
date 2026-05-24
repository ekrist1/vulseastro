export interface SignInInput { email: string; password: string }
export interface SignUpInput { email: string; password: string; name: string }
export interface SessionUser { id: string; email: string; name: string; role: 'admin' | 'editor' | 'member' }
export type Session = { user: SessionUser } | null

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Request failed (${res.status})`)
  return res.json() as Promise<T>
}

export const auth = {
  signIn: (input: SignInInput) => call<{ data: unknown }>('/api/auth/sign-in/email', input),
  signUp: (input: SignUpInput) => call<{ data: unknown }>('/api/auth/sign-up/email', input),
  signOut: () => call<unknown>('/api/auth/sign-out', {}),
  requestPasswordReset: (email: string, redirectTo = '/reset-password') =>
    call<unknown>('/api/auth/request-password-reset', { email, redirectTo }),
  resetPassword: (token: string, password: string) => call<unknown>('/api/auth/reset-password', { token, newPassword: password }),
  session: async (): Promise<Session> => {
    const res = await fetch('/api/auth/get-session', { credentials: 'same-origin' })
    if (!res.ok) return null
    return res.json() as Promise<Session>
  },
}
