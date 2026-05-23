import { VulseError } from '../core/errors.js'

export interface OkEnvelope<T> { ok: true; data: T }
export interface FailEnvelope { ok: false; error: { code: string; message: string; details?: unknown } }

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data } satisfies OkEnvelope<T>, init)
}

export function fail(err: unknown): Response {
  if (VulseError.isVulseError(err)) {
    return Response.json({
      ok: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    } satisfies FailEnvelope, { status: err.status })
  }
  console.error('[vulse] internal error:', err)
  return Response.json({
    ok: false, error: { code: 'INTERNAL', message: 'Internal server error' },
  } satisfies FailEnvelope, { status: 500 })
}
