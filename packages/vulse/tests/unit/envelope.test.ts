import { describe, it, expect } from 'vitest'
import { ok, fail } from '../../src/server/envelope'
import { ValidationError } from '../../src/core/errors'

describe('envelope', () => {
  it('ok wraps payload with status 200', async () => {
    const r = ok({ id: 1 })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, data: { id: 1 } })
  })

  it('fail emits VulseError status + code', async () => {
    const r = fail(new ValidationError('bad', { field: 'title' }))
    expect(r.status).toBe(422)
    expect(await r.json()).toEqual({ ok: false, error: { code: 'VALIDATION', message: 'bad', details: { field: 'title' } } })
  })

  it('fail on unknown error → 500 with INTERNAL', async () => {
    const r = fail(new Error('boom'))
    expect(r.status).toBe(500)
    const body = await r.json() as { error: { code: string } }
    expect(body.error.code).toBe('INTERNAL')
  })
})
