export class AdminApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown, public status?: number) {
    super(message)
    this.name = 'AdminApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init } as globalThis.RequestInit)
  const body = await res.json() as { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }
  if (body.ok) return body.data
  throw new AdminApiError(body.error.code, body.error.message, body.error.details, res.status)
}

export const adminApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
